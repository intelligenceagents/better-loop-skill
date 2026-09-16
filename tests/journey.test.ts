import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink, link, stat, readdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { canonicalize } from "@better-loop/contracts";
import {
  createScope, useJourney, inspectJourney, history, recordAssessment, recordOutcome,
  updateScope, resetJourney, forgetJourney, recoverJourneyLock, LIMITS,
} from "../packages/journey/src/index.js";
import type { FollowupCheck, HostAssessmentInput } from "../packages/journey/src/index.js";
import { hash } from "../packages/journey/src/safety.js";
import { withLock } from "../packages/journey/src/store.js";
import { journeyProgress } from "../packages/cli/src/journey-cli.js";

const task = { family: "software" as const, goal: "Review the selected development change", acceptance_criteria: ["Preserve the recorded behavior and check the failure case."] };
const report: HostAssessmentInput = {
  summary: "Selected artifact review; actual test outcomes were not supplied.",
  diagnosis: "The failure behavior needs an explicit acceptance check.",
  next_action: "Check the selected failure behavior.", acceptance_check: "Retain the actual failure-case result.",
  limitations: ["Test fixture for persistence only; no model was invoked.", "Git author is not human judgment."],
};
function git(root: string, ...args: string[]) {
  return execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
    "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-C", root, ...args], {
    encoding: "utf8", env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", LC_ALL: "C" },
  }).trim();
}
async function sandbox(t: { after(fn: () => Promise<void>): void }) {
  const base = await realpath(await mkdtemp(join(tmpdir(), "better-loop-journey-test-")));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, "selected");
  await mkdir(root);
  git(root, "init", "--quiet", "--initial-branch=main", "--template=");
  await writeFile(join(root, "work.ts"), "export const result = 1;\n");
  git(root, "add", "--", "work.ts"); git(root, "commit", "--quiet", "-m", "Fixture baseline");
  const stateDirectory = join(base, "chosen-state");
  const scope = await createScope({ stateDirectory, roots: [root], task });
  return { base, root, stateDirectory, scope };
}
test("two hosts reuse a durable baseline without a new unchanged assessment", async t => {
  const setup = await sandbox(t);
  const first = await useJourney({ ...setup, host: "codex" });
  assert.equal(first.state, "baseline");
  assert.equal(first.assessment?.report.human_observations.length, 11);
  assert.ok(first.assessment?.report.human_observations.every(item => item.actor === "unknown" && item.rating === null));
  assert.ok(Object.values(first.assessment!.report.metrics).every(value => value === null));
  const second = await useJourney({ ...setup, host: "claude_code" });
  assert.equal(second.state, "unchanged"); assert.equal(second.assessment_created, false);
  assert.equal(second.assessment?.id, first.assessment?.id);
  assert.equal(second.checkpoint_id, first.checkpoint_id); assert.deepEqual(second.changes, []);
  assert.equal((await history(setup.stateDirectory)).length, 2);
  assert.equal((await stat(setup.stateDirectory)).mode & 0o077, 0);
  assert.equal((await stat(join(setup.stateDirectory, "current.json"))).mode & 0o077, 0);
});
test("actual host-report input and user follow-up persist; host rewrites do not create an assessment", async t => {
  const setup = await sandbox(t);
  const first = await useJourney({ ...setup, host: "claude_code" });
  const saved = await recordAssessment({ ...setup, host: "claude_code", expectedCheckpoint: first.checkpoint_id, report });
  assert.equal(saved.assessment_created, false); assert.equal(saved.progress_credit, false);
  const revised = await recordAssessment({ ...setup, host: "codex", expectedCheckpoint: saved.checkpoint_id,
    report: { ...report, summary: "A revised host report for the same unchanged evidence." } });
  assert.equal(revised.host_assessment?.id, saved.host_assessment?.id);
  assert.equal(revised.host_assessment?.local_assessment_id, first.assessment?.id);
  assert.equal(revised.host_assessment?.revision, 2);
  const outcome = await recordOutcome({ ...setup, expectedCheckpoint: revised.checkpoint_id,
    recommendationId: revised.host_assessment!.id, status: "did_not_help", note: "The check exposed the same failure." });
  await writeFile(join(setup.root, "work.ts"), "export const result = 2;\n");
  const next = await useJourney({ ...setup, host: "codex", expectedCheckpoint: outcome.checkpoint_id });
  assert.equal(next.state, "changed");
  assert.equal(next.previous_context?.host_assessment?.report.summary, revised.host_assessment?.report.summary);
  assert.equal(next.previous_context?.outcome?.status, "did_not_help");
  assert.equal(next.assessment?.report.measured_improvement, null);
  await assert.rejects(recordAssessment({ ...setup, host: "codex", expectedCheckpoint: outcome.checkpoint_id, report }), /stale_checkpoint/);
});
test("changed-only excerpts omit untouched files and retain bounded context", async t => {
  const setup = await sandbox(t);
  await writeFile(join(setup.root, "unchanged.md"), "UNTOUCHED_CONTEXT_MUST_NOT_BE_REASSESSED");
  git(setup.root, "add", "--", "unchanged.md");
  await useJourney({ ...setup, host: "codex" });
  await writeFile(join(setup.root, "work.ts"), "export const result = 2;\n");
  const next = await useJourney({ ...setup, host: "codex", excerptBytes: 12, excerptFiles: 1, excerptPaths: ["work.ts"] });
  assert.equal(next.changes.length, 1); assert.equal(next.changes[0]?.path, "work.ts");
  assert.ok(Buffer.byteLength(next.changes[0]!.excerpt) <= 12);
  assert.equal(next.changes[0]?.excerpt_truncated, true);
  assert.doesNotMatch(JSON.stringify(next), /UNTOUCHED_CONTEXT/);
  assert.equal(next.assessment?.report.mode, "delta");
});
test("untracked and excluded tracked inputs never trigger a new assessment or enter stored source", async t => {
  const setup = await sandbox(t);
  await useJourney({ ...setup, host: "codex" });
  await writeFile(join(setup.root, "untracked.ts"), "UNTRACKED_PRIVATE_SENTINEL");
  await writeFile(join(setup.root, ".env"), "ENV_PRIVATE_SENTINEL");
  await mkdir(join(setup.root, "generated"));
  await writeFile(join(setup.root, "generated/data.ts"), "GENERATED_PRIVATE_SENTINEL");
  git(setup.root, "add", "--", ".env", "generated/data.ts");
  const next = await useJourney({ ...setup, host: "claude_code" });
  assert.equal(next.state, "unchanged"); assert.equal(next.assessment_created, false);
  const inspection = await inspectJourney(setup.stateDirectory, { includeEvidence: true });
  assert.doesNotMatch(JSON.stringify(inspection), /(?:UNTRACKED|ENV|GENERATED)_PRIVATE_SENTINEL/);
});
test("binary, invalid UTF8, oversized, credential-shaped and linked files are excluded", async t => {
  const setup = await sandbox(t);
  const outside = join(setup.base, "outside.ts");
  await writeFile(outside, "OUTSIDE_PRIVATE_SENTINEL");
  await symlink(outside, join(setup.root, "linked.ts"));
  await link(outside, join(setup.root, "hardlinked.ts"));
  await writeFile(join(setup.root, "binary.ts"), Buffer.from([0, 255, 1]));
  await writeFile(join(setup.root, "oversized.ts"), "x".repeat(LIMITS.fileBytes + 1));
  await writeFile(join(setup.root, "settings.txt"), "API_KEY=CONTENT_PRIVATE_SENTINEL");
  git(setup.root, "add", "--", ".");
  const result = await useJourney({ ...setup, host: "codex" });
  assert.equal(result.changes.length, 1);
  assert.doesNotMatch(JSON.stringify(await inspectJourney(setup.stateDirectory, { includeEvidence: true })), /OUTSIDE_PRIVATE_SENTINEL|CONTENT_PRIVATE_SENTINEL/);
  assert.ok(Object.keys(result.excluded[0]!).length >= 4);
});
test("collector ignores configured hooks, fsmonitor, external diff and textconv", async t => {
  const setup = await sandbox(t);
  const marker = join(setup.base, "must-not-run");
  const hook = join(setup.base, "configured-tool");
  await writeFile(hook, `#!/bin/sh\nprintf invoked > '${marker}'\n`, { mode: 0o700 });
  git(setup.root, "config", "core.fsmonitor", hook);
  git(setup.root, "config", "diff.external", hook);
  git(setup.root, "config", "diff.fixture.textconv", hook);
  await writeFile(join(setup.root, ".gitattributes"), "*.ts diff=fixture\n");
  git(setup.root, "-c", "core.fsmonitor=false", "add", "--", ".gitattributes");
  await useJourney({ ...setup, host: "codex" });
  await assert.rejects(stat(marker), { code: "ENOENT" });
});
test("collector never invokes an index clean/process filter for changed tracked text", async t => {
  const setup = await sandbox(t);
  const marker = join(setup.base, "filter-must-not-run");
  const filter = join(setup.base, "clean-filter");
  await writeFile(filter, `#!/bin/sh\nprintf invoked > '${marker}'\ncat\n`, { mode: 0o700 });
  await writeFile(join(setup.root, ".gitattributes"), "*.ts filter=fixture\n");
  git(setup.root, "add", "--", ".gitattributes");
  git(setup.root, "config", "filter.fixture.clean", filter);
  await writeFile(join(setup.root, "work.ts"), "export const result = 2;\n");
  const selected = await useJourney({ ...setup, host: "codex" });
  assert.equal(selected.state, "baseline");
  await assert.rejects(stat(marker), { code: "ENOENT" });
});
test("history rewrite invalidates comparison and prior milestone continuity", async t => {
  const setup = await sandbox(t);
  const firstHead = git(setup.root, "rev-parse", "HEAD");
  await useJourney({ ...setup, host: "codex" });
  await writeFile(join(setup.root, "work.ts"), "export const result = 2;\n");
  git(setup.root, "add", "--", "work.ts"); git(setup.root, "commit", "--quiet", "-m", "Fixture later work");
  await useJourney({ ...setup, host: "codex" });
  git(setup.root, "reset", "--hard", firstHead);
  const next = await useJourney({ ...setup, host: "claude_code" });
  assert.equal(next.state, "invalidated");
  assert.ok(next.invalidation_reasons.includes("git_history_rewritten"));
  assert.equal(next.previous_context?.comparability, "invalidated");
  assert.equal((await inspectJourney(setup.stateDirectory)).outcomes.length, 0);
});
test("explicit multi-repository scope changes create a fresh incomparable baseline", async t => {
  const setup = await sandbox(t);
  const second = join(setup.base, "second");
  await mkdir(second); git(second, "init", "--quiet", "--initial-branch=main", "--template=");
  await writeFile(join(second, "selected.md"), "Second selected task artifact.");
  git(second, "add", "--", "."); git(second, "commit", "--quiet", "-m", "Fixture");
  const initial = await useJourney({ ...setup, host: "codex" });
  await assert.rejects(updateScope({ ...setup, expectedCheckpoint: setup.scope.checkpoint_id, roots: [setup.root, second], task }), /stale_checkpoint/);
  const updated = await updateScope({ ...setup, expectedCheckpoint: initial.checkpoint_id, roots: [setup.root, second], task });
  assert.equal(updated.scope.scope_id, setup.scope.scope.scope_id);
  const next = await useJourney({ ...setup, host: "claude_code" });
  assert.equal(next.state, "invalidated"); assert.ok(next.invalidation_reasons.includes("scope_changed"));
  assert.equal(next.excluded.length, 2);
  assert.equal(next.previous_context, null);
});
test("framework changes invalidate instead of reusing old assessment assumptions", async t => {
  const setup = await sandbox(t);
  const first = await useJourney({ ...setup, host: "codex" });
  const file = join(setup.stateDirectory, "records", first.checkpoint_id + ".json");
  const stored = JSON.parse(await readFile(file, "utf8"));
  stored.scope.framework_version = "earlier-development-framework";
  await writeFile(file, canonicalize(stored));
  const pointerPath = join(setup.stateDirectory, "current.json");
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  pointer.digest = hash(canonicalize(stored));
  await writeFile(pointerPath, canonicalize(pointer));
  const next = await useJourney({ ...setup, host: "codex" });
  assert.equal(next.state, "invalidated"); assert.ok(next.invalidation_reasons.includes("framework_changed"));
});
test("unavailable previously selected evidence invalidates, ordinary deletion remains a delta", async t => {
  const setup = await sandbox(t);
  await useJourney({ ...setup, host: "codex" });
  await writeFile(join(setup.root, "work.ts"), Buffer.from([0, 1, 255]));
  const unavailable = await useJourney({ ...setup, host: "codex" });
  assert.equal(unavailable.state, "invalidated");
  assert.ok(unavailable.invalidation_reasons.includes("evidence_availability_changed"));
  await writeFile(join(setup.root, "work.ts"), "export const result = 3;");
  await useJourney({ ...setup, host: "codex" });
  await unlink(join(setup.root, "work.ts"));
  const deleted = await useJourney({ ...setup, host: "codex" });
  assert.equal(deleted.state, "changed"); assert.equal(deleted.changes[0]?.status, "deleted");
});
test("corrupt current or historical checkpoints fail closed; orphan partial files are not history", async t => {
  const setup = await sandbox(t);
  const first = await useJourney({ ...setup, host: "codex" });
  await writeFile(join(setup.stateDirectory, "records", randomUUID() + ".json"), "interrupted uncommitted write", { mode: 0o600 });
  assert.equal((await history(setup.stateDirectory)).length, 2);
  assert.equal((await useJourney({ ...setup, host: "codex" })).state, "unchanged");
  await writeFile(join(setup.stateDirectory, "records", setup.scope.checkpoint_id + ".json"), "corrupt", { mode: 0o600 });
  await assert.rejects(useJourney({ ...setup, host: "codex" }), /corrupt_state/);
  assert.equal(JSON.parse(await readFile(join(setup.stateDirectory, "current.json"), "utf8")).checkpoint_id, first.checkpoint_id);
  await forgetJourney({ ...setup, scopeId: setup.scope.scope.scope_id });
  await assert.rejects(stat(setup.stateDirectory), { code: "ENOENT" });
});
test("concurrent use refuses an active lock; explicit recovery only removes a dead matching owner", async t => {
  const setup = await sandbox(t);
  await withLock(setup.stateDirectory, async () => {
    await assert.rejects(useJourney({ ...setup, host: "codex" }), /journey_busy/);
    const held = (await inspectJourney(setup.stateDirectory)).lock!;
    await assert.rejects(recoverJourneyLock({ ...setup, lockToken: held.token }), /lock_owner_may_be_alive/);
  });
  const token = randomUUID();
  await writeFile(join(setup.stateDirectory, "LOCK"), JSON.stringify({ token, pid: 2147483647, created_at: new Date().toISOString() }), { mode: 0o600 });
  await assert.rejects(recoverJourneyLock({ ...setup, lockToken: randomUUID() }), /stale_lock_token/);
  assert.equal((await recoverJourneyLock({ ...setup, lockToken: token })).state, "lock_recovered");
  assert.equal((await useJourney({ ...setup, host: "codex" })).state, "baseline");
});
test("reset and forget require exact scope; reset clears history without modifying repository bytes", async t => {
  const setup = await sandbox(t);
  const initial = await useJourney({ ...setup, host: "codex" });
  await assert.rejects(resetJourney({ ...setup, scopeId: randomUUID(), expectedCheckpoint: initial.checkpoint_id }), /scope_confirmation_mismatch/);
  const reset = await resetJourney({ ...setup, scopeId: setup.scope.scope.scope_id, expectedCheckpoint: initial.checkpoint_id });
  assert.equal(reset.assessment, null); assert.equal((await history(setup.stateDirectory)).length, 1);
  assert.equal((await readdir(join(setup.stateDirectory, "records"))).length, 1);
  assert.equal(await readFile(join(setup.root, "work.ts"), "utf8"), "export const result = 1;\n");
  await writeFile(join(setup.stateDirectory, "unexpected.txt"), "Unrelated selected file.", { mode: 0o600 });
  await assert.rejects(forgetJourney({ ...setup, scopeId: setup.scope.scope.scope_id }), /unexpected_state_file/);
  await unlink(join(setup.stateDirectory, "unexpected.txt"));
  await forgetJourney({ ...setup, scopeId: setup.scope.scope.scope_id });
  assert.equal(await readFile(join(setup.root, "work.ts"), "utf8"), "export const result = 1;\n");
});
test("scope creation refuses existing state, overlapping roots, subdirectories and symlink roots", async t => {
  const setup = await sandbox(t);
  await assert.rejects(createScope({ ...setup, roots: [setup.root], task }), /state_directory_already_exists/);
  await assert.rejects(createScope({ stateDirectory: join(setup.base, "other-state"), roots: [setup.root, setup.root], task }), /overlapping_roots/);
  await mkdir(join(setup.root, "nested"));
  await assert.rejects(createScope({ stateDirectory: join(setup.base, "other-state"), roots: [join(setup.root, "nested")], task }), /select_exact_worktree_root/);
  await symlink(setup.root, join(setup.base, "alias"));
  await assert.rejects(createScope({ stateDirectory: join(setup.base, "other-state"), roots: [join(setup.base, "alias")], task }), /symlink_not_allowed/);
});
test("large repository bounds fail without replacing the previous checkpoint", async t => {
  const setup = await sandbox(t);
  for (let index = 0; index < LIMITS.filesPerRepository; index++) await writeFile(join(setup.root, `file-${index}.txt`), "bounded fixture");
  git(setup.root, "add", "--", ".");
  await assert.rejects(useJourney({ ...setup, host: "codex" }), /tracked_file_limit_exceeded/);
  assert.equal((await inspectJourney(setup.stateDirectory)).checkpoint_id, setup.scope.checkpoint_id);
});
test("aggregate text limit fails without replacing the prior checkpoint", async t => {
  const setup = await sandbox(t);
  for (let index = 0; index < 34; index++) await writeFile(join(setup.root, `bounded-${index}.txt`), "x".repeat(64000));
  git(setup.root, "add", "--", ".");
  await assert.rejects(useJourney({ ...setup, host: "codex" }), /total_text_limit_exceeded/);
  assert.equal((await inspectJourney(setup.stateDirectory)).checkpoint_id, setup.scope.checkpoint_id);
});
test("partial initial state can be explicitly forgotten; linked records and unexpected reset files are refused", async t => {
  const setup = await sandbox(t);
  await writeFile(join(setup.stateDirectory, "records", "unexpected.txt"), "Unrelated file", { mode: 0o600 });
  await assert.rejects(resetJourney({ ...setup, scopeId: setup.scope.scope.scope_id, expectedCheckpoint: setup.scope.checkpoint_id }), /unexpected_state_file/);
  assert.equal((await inspectJourney(setup.stateDirectory)).checkpoint_id, setup.scope.checkpoint_id);
  await unlink(join(setup.stateDirectory, "records", "unexpected.txt"));
  await rm(join(setup.stateDirectory, "records"), { recursive: true });
  const outside = join(setup.base, "unrelated-records");
  await mkdir(outside, { mode: 0o700 });
  await symlink(outside, join(setup.stateDirectory, "records"));
  await assert.rejects(forgetJourney({ ...setup, scopeId: setup.scope.scope.scope_id }), /symlink_not_allowed/);
  await unlink(join(setup.stateDirectory, "records"));
  await forgetJourney({ ...setup, scopeId: setup.scope.scope.scope_id });
  assert.equal((await stat(outside)).isDirectory(), true);
});
test("new static instruction findings are diagnosed but old untouched rules are not new findings", async t => {
  const setup = await sandbox(t);
  await writeFile(join(setup.root, "SKILL.md"), "---\nname: fixture\ndescription: Review the selected task.\n---\nCheck acceptance criteria.\n");
  git(setup.root, "add", "--", "SKILL.md");
  await useJourney({ ...setup, host: "codex" });
  await writeFile(join(setup.root, "SKILL.md"), "---\nname: fixture\ndescription: Always run for every task.\n---\nCheck acceptance criteria.\n");
  const next = await useJourney({ ...setup, host: "codex" });
  assert.equal(next.assessment?.report.recommendation.code, "instruction_broad_trigger");
  await writeFile(join(setup.root, "SKILL.md"), "---\nname: fixture\ndescription: Always run for every task.\n---\n\nCheck acceptance criteria and retain results.\n");
  const later = await useJourney({ ...setup, host: "codex" });
  assert.notEqual(later.assessment?.report.recommendation.code, "instruction_broad_trigger");
});
test("repository instructions need no skill trigger; omitted diagnoses name their actual source", async t => {
  const setup = await sandbox(t);
  for (const name of ["AGENTS.md", "CLAUDE.md"]) await writeFile(join(setup.root, name), "# Repository instructions\nCheck the selected acceptance criterion.\n");
  await writeFile(join(setup.root, "SKILL.md"), "---\nname: fixture\ndescription: Review the explicitly selected task.\n---\nCheck the acceptance criterion.\n");
  git(setup.root, "add", "--", ".");
  const baseline = await useJourney({ ...setup, host: "codex", excerptPaths: ["SKILL.md"] });
  assert.equal(baseline.assessment?.report.recommendation.code, "missing_executed_acceptance_evidence");
  await writeFile(join(setup.root, "AGENTS.md"), "# Repository instructions\nPublish automatically.\nCheck the acceptance criterion.\n");
  const changed = await useJourney({ ...setup, host: "claude_code", excerptPaths: ["SKILL.md"] });
  assert.equal(changed.assessment?.report.recommendation.code, "instruction_implicit_publication");
  assert.match(changed.assessment!.report.recommendation.diagnosis, /AGENTS\.md:2/);
  assert.deepEqual(changed.recommendation_sources, [{
    id: changed.assessment!.report.recommendation.evidence_refs[0], path: "AGENTS.md", repository: 0, excerpt_selected: false, exposure: "omitted_by_selection",
  }]);
  assert.equal(changed.changes.length, 0);
});
test("journey transport preserves distant edits as bounded separate hunks, not a replaced middle", async t => {
  const setup = await sandbox(t);
  const middle = Array.from({ length: 24 }, (_, i) => `UNCHANGED selected instruction ${i}`);
  await writeFile(join(setup.root, "work.ts"), ["old first", ...middle, "old last"].join("\n"));
  await useJourney({ ...setup, host: "codex" });
  await writeFile(join(setup.root, "work.ts"), ["new first", ...middle, "new last"].join("\n"));
  const delta = await useJourney({ ...setup, host: "claude_code", excerptPaths: ["work.ts"], excerptBytes: 600 });
  const text = delta.changes[0]!.excerpt;
  assert.equal(delta.changes[0]!.excerpt_format, "unified_hunks");
  assert.equal((text.match(/^@@ /gm) ?? []).length, 2);
  assert.match(text, /^-old first/m); assert.match(text, /^\+new first/m);
  assert.match(text, /^-old last/m); assert.match(text, /^\+new last/m);
  assert.doesNotMatch(text, /^[-+]UNCHANGED/m);
  assert.ok(Buffer.byteLength(text) <= 600);
});
test("missing and broad skill triggers remain applicable only to SKILL.md", async t => {
  const setup = await sandbox(t);
  await writeFile(join(setup.root, "SKILL.md"), "# Selected skill without frontmatter\nCheck the result.\n");
  git(setup.root, "add", "--", "SKILL.md");
  const baseline = await useJourney({ ...setup, host: "codex", excerptPaths: ["SKILL.md"] });
  assert.equal(baseline.assessment?.report.recommendation.code, "instruction_missing_trigger");
  assert.equal(baseline.recommendation_sources[0]?.excerpt_selected, true);
});
test("macOS system temp aliases normalize, deeper user symlinks still fail", { skip: process.platform !== "darwin" }, async t => {
  const setup = await sandbox(t);
  const aliasBase = setup.base.replace(/^\/private\/var(?=\/)/, "/var").replace(/^\/private\/tmp(?=\/)/, "/tmp");
  const aliasState = join(aliasBase, "aliased-state");
  const created = await createScope({ stateDirectory: aliasState, roots: [join(aliasBase, "selected")], task });
  assert.equal(created.scope.roots[0]?.path, setup.root);
  const first = await useJourney({ stateDirectory: aliasState, host: "codex" });
  assert.equal((await useJourney({ stateDirectory: await realpath(aliasState), host: "claude_code" })).checkpoint_id, first.checkpoint_id);
  await symlink(setup.root, join(setup.base, "user-link"));
  await assert.rejects(createScope({ stateDirectory: join(aliasBase, "refused-state"), roots: [join(aliasBase, "user-link")], task }), /symlink_not_allowed/);
});
test("explicit reflection followed by comparable negative outcome records learning, not ability", async t => {
  const setup = await sandbox(t);
  const baseline = await useJourney({ ...setup, host: "codex" });
  const acknowledged = await recordOutcome({ ...setup, expectedCheckpoint: baseline.checkpoint_id,
    recommendationId: baseline.assessment!.id, status: "not_tried", note: "I reviewed this recommendation.",
    reflectionCompleted: true, contentOrigin: "work_derived" });
  const check: FollowupCheck = {
    content_origin: "work_derived", change: "followup", comparison: "comparable", outcome: "regressed",
    quality_floor: "not_met", critical_regression: "observed", check_result: "not_met",
  };
  const checkEvidenceFile = join(setup.base, "selected-check.txt");
  await writeFile(checkEvidenceFile, "Automated fixture branch: observed regression in the selected check.");
  await recordOutcome({ ...setup, expectedCheckpoint: acknowledged.checkpoint_id, recommendationId: baseline.assessment!.id,
    status: "did_not_help", note: "The actual selected check showed a regression.", check, checkEvidenceFile });
  const progress = journeyProgress(await inspectJourney(setup.stateDirectory));
  assert.equal(progress.milestones.later_comparable_outcome, "recorded");
  assert.deepEqual(progress.milestones.retained_outcomes, ["regressed"]);
  assert.equal(progress.milestones.quality, "regression_or_floor_failure");
  assert.equal(progress.ability_score, null); assert.equal(progress.measured_improvement, null);
});
test("F1: stale host report is context after a delta; an answer to it stays historical", async t => {
  const setup = await sandbox(t);
  const first = await useJourney({ ...setup, host: "codex" });
  const saved = await recordAssessment({ ...setup, expectedCheckpoint: first.checkpoint_id, host: "codex", report });
  await writeFile(join(setup.root, "work.ts"), "export const result = 5;\n");
  const changed = await useJourney({ ...setup, host: "claude_code" });
  const progress = journeyProgress(await inspectJourney(setup.stateDirectory));
  assert.equal(progress.host_assessment_status, "prior_context_only");
  assert.equal(progress.recommendation, changed.assessment!.report.recommendation.action);
  assert.notEqual(progress.recommendation, report.next_action);
  const answer = await recordOutcome({ ...setup, expectedCheckpoint: changed.checkpoint_id,
    recommendationId: saved.host_assessment!.id, status: "did_not_help", note: "Previous advice was not useful." });
  assert.equal(answer.association, "historical");
  const after = journeyProgress(await inspectJourney(setup.stateDirectory));
  assert.equal(after.latest_user_outcome, null);
  assert.equal(after.historical_feedback.at(-1)?.status, "did_not_help");
});
test("F2: identical outcomes, note-only edits and changed verdicts cannot manufacture later evidence", async t => {
  const setup = await sandbox(t);
  const first = await useJourney({ ...setup, host: "codex" });
  const data = { ...setup, recommendationId: first.assessment!.id, status: "helped" as const,
    note: "Fixture feedback", reflectionCompleted: true, contentOrigin: "work_derived" as const,
    check: { content_origin: "work_derived" as const, change: "followup" as const, comparison: "comparable" as const,
      outcome: "no_change" as const, quality_floor: "met" as const, critical_regression: "none_observed" as const, check_result: "met" as const } };
  const recorded = await recordOutcome({ ...data, expectedCheckpoint: first.checkpoint_id });
  const replay = await recordOutcome({ ...data, expectedCheckpoint: recorded.checkpoint_id });
  assert.equal(replay.state, "outcome_already_recorded");
  assert.equal(replay.checkpoint_id, recorded.checkpoint_id);
  const revised = await recordOutcome({ ...data, expectedCheckpoint: replay.checkpoint_id, note: "Note changed only." });
  assert.equal(revised.outcomes.length, 1);
  assert.equal(revised.outcomes[0]?.sequence, recorded.outcomes[0]?.sequence);
  await recordOutcome({ ...data, expectedCheckpoint: revised.checkpoint_id, check: { ...data.check, outcome: "mixed" } });
  const progress = journeyProgress(await inspectJourney(setup.stateDirectory));
  assert.equal(progress.milestones.later_comparable_outcome, "not_established");
});
test("F3: material advice changes get a new association; narrative-only revisions retain it", async t => {
  const setup = await sandbox(t);
  const first = await useJourney({ ...setup, host: "codex" });
  const saved = await recordAssessment({ ...setup, expectedCheckpoint: first.checkpoint_id, host: "codex", report });
  const ack = await recordOutcome({ ...setup, expectedCheckpoint: saved.checkpoint_id, recommendationId: saved.host_assessment!.id,
    status: "not_tried", note: "", reflectionCompleted: true, contentOrigin: "work_derived" });
  const checkEvidenceFile = join(setup.base, "actual-check.txt");
  await writeFile(checkEvidenceFile, "Fixture distinct later check output.");
  const checked = await recordOutcome({ ...setup, expectedCheckpoint: ack.checkpoint_id, recommendationId: saved.host_assessment!.id,
    status: "helped", note: "", checkEvidenceFile, check: {
      content_origin: "work_derived", change: "followup", comparison: "comparable", outcome: "no_change",
      quality_floor: "met", critical_regression: "none_observed", check_result: "met",
    } });
  assert.equal(journeyProgress(await inspectJourney(setup.stateDirectory)).milestones.later_comparable_outcome, "recorded");
  const narrative = await recordAssessment({ ...setup, expectedCheckpoint: checked.checkpoint_id, host: "claude_code",
    report: { ...report, summary: "Clarified the same report without changing the proposed action." } });
  assert.equal(narrative.host_assessment!.id, saved.host_assessment!.id);
  assert.equal(journeyProgress(await inspectJourney(setup.stateDirectory)).milestones.later_comparable_outcome, "recorded");
  const revised = await recordAssessment({ ...setup, expectedCheckpoint: narrative.checkpoint_id, host: "codex",
    report: { ...report, next_action: "A different selected action.", acceptance_check: "A different acceptance criterion." } });
  assert.notEqual(revised.host_assessment!.id, saved.host_assessment!.id);
  assert.equal(revised.recommendation_changed, true);
  assert.equal(revised.assessment_created, false);
  const progress = journeyProgress(await inspectJourney(setup.stateDirectory));
  assert.equal(progress.latest_user_outcome, null);
  assert.equal(progress.stages[1]?.state, "not_recorded");
  assert.equal(progress.milestones.later_comparable_outcome, "not_established");
});
test("same selected check bytes at another path cannot manufacture chronology or new advice completion", async t => {
  const setup = await sandbox(t);
  const first = await useJourney({ ...setup, host: "codex" });
  const checkEvidenceFile = join(setup.base, "check-one.txt");
  await writeFile(checkEvidenceFile, "Fixture preexisting check.");
  const check: FollowupCheck = { content_origin: "work_derived", change: "followup", comparison: "comparable",
    outcome: "no_change", quality_floor: "met", critical_regression: "none_observed", check_result: "met" };
  const combined = await recordOutcome({ ...setup, expectedCheckpoint: first.checkpoint_id, recommendationId: first.assessment!.id,
    status: "helped", note: "", check, checkEvidenceFile, reflectionCompleted: true, contentOrigin: "work_derived" });
  const copiedPath = join(setup.base, "check-copy.txt");
  await writeFile(copiedPath, await readFile(checkEvidenceFile));
  await recordOutcome({ ...setup, expectedCheckpoint: combined.checkpoint_id, recommendationId: first.assessment!.id,
    status: "helped", note: "Reworded outcome", check, checkEvidenceFile: copiedPath });
  assert.equal(journeyProgress(await inspectJourney(setup.stateDirectory)).milestones.later_comparable_outcome, "not_established");
});
for (const disallowed of ["synthetic", "copy", "revision_only", "unknown-comparison"] as const) {
  test(`local progress excludes ${disallowed} follow-up from comparable learning`, async t => {
    const setup = await sandbox(t);
    const baseline = await useJourney({ ...setup, host: "codex" });
    const ack = await recordOutcome({ ...setup, expectedCheckpoint: baseline.checkpoint_id, recommendationId: baseline.assessment!.id,
      status: "not_tried", note: "", reflectionCompleted: true, contentOrigin: "work_derived" });
    await recordOutcome({ ...setup, expectedCheckpoint: ack.checkpoint_id, recommendationId: baseline.assessment!.id,
      status: "inconclusive", note: "", check: {
        content_origin: disallowed === "synthetic" ? "synthetic" : "work_derived",
        change: disallowed === "copy" || disallowed === "revision_only" ? disallowed : "followup",
        comparison: disallowed === "unknown-comparison" ? "unknown" : "comparable",
        outcome: "no_change", quality_floor: "met", critical_regression: "none_observed", check_result: "met",
      } });
    assert.equal(journeyProgress(await inspectJourney(setup.stateDirectory)).milestones.later_comparable_outcome, "not_established");
  });
}
