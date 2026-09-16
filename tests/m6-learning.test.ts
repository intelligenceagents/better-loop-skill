import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  CONSTRAINTS, OBJECTIVES, PROBLEM_TYPES, TASK_FAMILIES, matchLearningTask, parseLearningQuery,
  parsePublicLesson, parsePublicLessonsResponse, parseLearningServiceOrigin, selectLearningLessons, retrieveLearningLessons,
} from "../packages/core/src/index.js";
import type { LearningQuery, PublicLesson, PublicLessonsResponse } from "../packages/core/src/index.js";
import { learnFromService } from "../packages/cli/src/learning-service.js";
import { measureEvaluation, repeatedImprovement } from "@better-loop/measurement";
import { share } from "./cases.js";

const query: LearningQuery = {
  task_family: "analysis_finance", problem_type: "reconciling_data", objective: "correctness", constraints: ["source_required"],
};
const now = Date.parse("2026-09-14T18:00:00.000Z");
function lesson(id = "00000000-0000-4000-8000-000000000001", family: PublicLesson["task"]["task_family"] = "mathematics_science"): PublicLesson {
  const candidate = share();
  return {
    public_id: id, public_url: `/stories/${id}`, title: "Check units before combining values",
    lesson: "A unit check can make an incompatible total visible before a conclusion is drafted.",
    limits: "This did not establish a speedup; a source with unclear units still needs review.",
    task: { ...candidate.task, task_family: family, problem_type: "reconciling_data", objective: "correctness", constraints: ["source_required", "fixed_inputs"] },
    conditions: candidate.conditions, evidence_tier: "self_reported", content_origin: "work_derived",
    framework_version: "better-loop-fluency-0.1",
  };
}
function response(lessons = [lesson()], instant = now): PublicLessonsResponse {
  return { schema_version: "bl-public-lessons-0.1", generated_at: new Date(instant).toISOString(), expires_at: new Date(instant + 300000).toISOString(), lessons };
}
test("controlled learning taxonomy matches the unchanged share contract exactly", async () => {
  const schema = JSON.parse(await readFile("schemas/share-candidate.schema.json", "utf8"));
  const task = schema.properties.task.properties;
  assert.deepEqual(TASK_FAMILIES, task.task_family.enum);
  assert.deepEqual(PROBLEM_TYPES, task.problem_type.enum);
  assert.deepEqual(OBJECTIVES, task.objective.enum);
  assert.deepEqual(CONSTRAINTS, task.constraints.items.enum);
});
test("same problem/objective and requested constraints match across families without asserting comparability", () => {
  const other: LearningQuery = { ...query, task_family: "mathematics_science", constraints: ["source_required", "fixed_inputs"] };
  assert.deepEqual(matchLearningTask(query, other), {
    matches: true, same_family: false, missing_constraints: [], additional_conditions: ["fixed_inputs"], comparability: "not_established",
  });
  assert.equal(matchLearningTask(query, { ...other, objective: "lower_resource_use" }).matches, false);
  assert.equal(matchLearningTask(query, { ...other, problem_type: "creating_content" }).matches, false);
  assert.equal(matchLearningTask(query, { ...other, constraints: ["fixed_inputs"] }).matches, false);
});
test("free query text, unknown fields, private evidence, duplicates and arbitrary task labels are rejected before retrieval", async () => {
  for (const input of [
    { ...query, q: "SYNTHETIC_PRIVATE_TASK" }, { ...query, evidence: "PRIVATE" },
    { ...query, task_family: "employer" }, { ...query, constraints: ["source_required", "source_required"] },
  ]) {
    assert.throws(() => parseLearningQuery(input));
    let invoked = false;
    await assert.rejects(retrieveLearningLessons(input, { async retrieve() { invoked = true; return response(); } }, { now }));
    assert.equal(invoked, false);
  }
  let getterInvoked = false;
  assert.throws(() => parseLearningQuery({ ...query, get extra() { getterInvoked = true; return "PRIVATE"; } }));
  assert.equal(getterInvoked, false);
});
test("lesson validation rejects synthetic/private/internal fields, unsafe source links and unearned trust", () => {
  for (const change of [
    { content_origin: "synthetic" }, { owner_id: "private" }, { public_url: "https://untrusted.test" },
    { evidence_tier: "independently_verified" }, { framework_version: "future" }, { consent: { community: true } },
    { task: { ...lesson().task, private_goal: "private" } }, { conditions: { ...lesson().conditions, private_model: "private" } },
  ]) assert.throws(() => parsePublicLesson({ ...lesson(), ...change }));
  assert.throws(() => parsePublicLessonsResponse({ ...response(), unknown: true }));
  assert.throws(() => parsePublicLessonsResponse(response([lesson(), lesson()])), /duplicate_public_lesson/);
  assert.throws(() => parsePublicLessonsResponse({ ...response(), expires_at: new Date(now + 301000).toISOString() }), /lifetime/);
  assert.deepEqual(parsePublicLessonsResponse(response()), response());
});
test("current fresh eligible results cite their public source and constraints, including useful adverse lessons", () => {
  const adverse = { ...lesson(), lesson: "The extra process step did not help this task. Check whether the added work is justified before reusing it." };
  const selected = selectLearningLessons(query, response([adverse]), { eligibility: "current_service_response", now });
  assert.equal(selected.state, "local_experiment_proposals");
  assert.equal(selected.proposals[0]!.source.url, `https://better-loop.com${adverse.public_url}`);
  assert.deepEqual(selected.proposals[0]!.constraints, ["source_required", "fixed_inputs"]);
  assert.match(selected.proposals[0]!.suggestion, /did not help/);
  assert.match(selected.proposals[0]!.comparison, /does not establish equal difficulty/);
  assert.equal(selected.ability_score, null);
  assert.equal(selected.automatic_execution, false);
  assert.equal(selected.upload, false);
});
test("offline, expired and future eligibility cannot generate automated suggestions", () => {
  const offline = selectLearningLessons(query, response(), { eligibility: "offline_snapshot", now });
  assert.equal(offline.state, "offline_eligibility_unverified");
  assert.deepEqual(offline.proposals, []);
  for (const instant of [now - 300001, now + 1000]) {
    const expired = selectLearningLessons(query, response([lesson()], instant), { eligibility: "current_service_response", now });
    assert.equal(expired.state, "expired_or_future_eligibility");
    assert.deepEqual(expired.proposals, []);
  }
});
test("same-family preference does not suppress cross-family matching, and selection caps proposals", () => {
  const lessons = [1, 2, 3, 4].map(index => lesson(`00000000-0000-4000-8000-00000000000${index}`, index === 4 ? "analysis_finance" : "mathematics_science"));
  const result = selectLearningLessons(query, response(lessons), { eligibility: "current_service_response", now });
  assert.equal(result.proposals.length, 3);
  assert.equal(result.proposals[0]!.same_family, true);
  assert.equal(result.proposals[1]!.same_family, false);
});
test("service origin must be explicit exact production HTTPS or numeric loopback, with no auth/path/query", () => {
  assert.equal(parseLearningServiceOrigin("http://127.0.0.1:3100"), "http://127.0.0.1:3100");
  assert.equal(parseLearningServiceOrigin("https://better-loop.com/"), "https://better-loop.com");
  for (const origin of ["http://better-loop.com", "https://evil.test", "http://localhost:3100", "https://better-loop.com/api/lessons", "https://user:pass@better-loop.com", "https://better-loop.com?q=private"]) {
    assert.throws(() => parseLearningServiceOrigin(origin));
  }
});
test("explicit service uses bounded no-auth GET taxonomy only and re-fetches withdrawn lessons without a cache", async () => {
  let lessons = [lesson()];
  let requests = 0;
  const server = createServer((request, reply) => {
    requests++;
    const url = new URL(request.url!, "http://127.0.0.1");
    assert.equal(request.method, "GET");
    assert.equal(url.pathname, "/api/lessons");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["constraints", "objective", "problem_type", "task_family"]);
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers.authorization, undefined);
    assert.equal(url.searchParams.get("task_family"), "analysis_finance");
    reply.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    reply.end(JSON.stringify(response(lessons, Date.now() - 5)));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const first = await learnFromService(query, origin);
    assert.equal(first.proposals.length, 1);
    assert.ok(first.proposals[0]!.source.url.startsWith(`${origin}/stories/`));
    lessons = [];
    const second = await learnFromService(query, origin);
    assert.equal(second.state, "no_eligible_matching_lessons");
    assert.deepEqual(second.proposals, []);
    assert.equal(requests, 2);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test("cached, redirected, oversized and malformed service responses fail closed", async () => {
  let variant = "cached";
  let redirectedRequests = 0;
  const server = createServer((request, reply) => {
    if (request.url === "/follow") redirectedRequests++;
    if (variant === "redirect") { reply.writeHead(302, { Location: "/follow" }); reply.end(); return; }
    reply.writeHead(200, { "Content-Type": "application/json", "Cache-Control": variant === "cached" ? "max-age=300" : "no-store" });
    reply.end(variant === "oversized" ? "a".repeat(65537) : variant === "malformed" ? '{"private":"SYNTHETIC_PRIVATE_SENTINEL"' : JSON.stringify(response([], Date.now() - 5)));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    for (variant of ["cached", "redirect", "oversized", "malformed"]) await assert.rejects(learnFromService(query, `http://127.0.0.1:${address.port}`));
    assert.equal(redirectedRequests, 0);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test("local milestone CLI delegates to measurement and excludes synthetic and duplicate records", async () => {
  const draft = JSON.parse(await readFile("evals/measurement/synthetic-draft.json", "utf8"));
  const measured = measureEvaluation(draft);
  assert.equal(measured.valid, true);
  if (!measured.valid) return;
  const inputs = [{ record: measured.record }, { record: measured.record }];
  const expected = repeatedImprovement(inputs);
  assert.equal(expected.eligible, false);
  assert.deepEqual(expected.qualifying_task_ids, []);
  assert.ok(expected.excluded.every(item => item.reasons.includes("duplicate_run_id")));
  const root = await mkdtemp(join(tmpdir(), "better-loop-m6-milestones-"));
  try {
    const input = join(root, "records.json");
    await writeFile(input, JSON.stringify(inputs));
    const result = await promisify(execFile)(process.execPath, [resolve("packages/cli/dist/cli.js"), "milestones", "--input", input], { encoding: "utf8" });
    const output = JSON.parse(result.stdout);
    assert.deepEqual(output.result, expected);
    assert.equal(output.ability_score, null);
    assert.equal(output.public_achievement, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
