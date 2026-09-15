import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { computeContributionDigest, validateContributionApproval } from "@better-loop/evidence";
import type { CapabilityEvidence, ContributionConsent } from "@better-loop/evidence";
import { share } from "./cases.js";

const entrypoint = resolve("packages/cli/dist/cli.js");
const cli = (args: string[]) => spawnSync(process.execPath, [entrypoint, ...args], { encoding: "utf8", timeout: 15000 });
function json(args: string[]) {
  const result = cli(args);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const base = await realpath(await mkdtemp(join(tmpdir(), "better-loop-journey-cli-")));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, "selected");
  await mkdir(root);
  const git = (...args: string[]) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-C", root, ...args], {
    env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }, stdio: "pipe",
  });
  git("init", "--quiet", "--initial-branch=main", "--template=");
  await writeFile(join(root, "work.ts"), "export const value = 1;\n");
  git("add", "--", "work.ts");
  const state = join(base, "state");
  const task = join(base, "task.json");
  await writeFile(task, JSON.stringify({ family: "software", goal: "Fixture selected behavior", acceptance_criteria: ["Retain the selected check result."] }));
  return { base, root, state, task };
}
test("separate CLI processes persist actual report input, recall across hosts, and expose only the delta", async t => {
  const f = await fixture(t);
  const created = json(["journey", "create", "--state", f.state, "--root", f.root, "--task", f.task, "--format", "json"]);
  const baseline = json(["journey", "use", "--state", f.state, "--host", "codex", "--format", "json"]);
  assert.equal(baseline.state, "baseline");
  const report = join(f.base, "report.json");
  await writeFile(report, JSON.stringify({ summary: "Fixture host-report persistence input, not model evidence.",
    diagnosis: "Need the actual failure result.", next_action: "Inspect the selected failure result.",
    acceptance_check: "Retain the actual check outcome.", limitations: ["Automated fixture only."] }));
  const saved = json(["journey", "record-assessment", "--state", f.state, "--host", "codex",
    "--expected", baseline.checkpoint_id, "--input", report, "--format", "json"]);
  const unchanged = json(["journey", "use", "--state", f.state, "--host", "claude_code", "--format", "json"]);
  assert.equal(unchanged.state, "unchanged");
  assert.equal(unchanged.checkpoint_id, saved.checkpoint_id);
  assert.equal(unchanged.progress.host_assessment_status, "current");
  assert.equal(unchanged.previous_context.host_assessment.report.summary, saved.host_assessment.report.summary);
  await writeFile(join(f.root, "work.ts"), "export const value = 2;\n");
  await writeFile(join(f.root, "untracked.ts"), "UNSELECTED_SENTINEL");
  const delta = json(["journey", "use", "--state", f.state, "--host", "claude_code", "--excerpt-bytes", "30",
    "--excerpt-files", "1", "--excerpt-path", "work.ts", "--format", "json"]);
  assert.equal(delta.state, "changed");
  assert.equal(delta.changes.length, 1);
  assert.equal(delta.progress.host_assessment_status, "prior_context_only");
  assert.doesNotMatch(JSON.stringify(delta), /UNSELECTED_SENTINEL/);
  assert.equal(created.scope.scope_id, delta.scope_id);
  assert.ok(Buffer.byteLength(delta.changes[0].excerpt) <= 30);
  assert.equal((await stat(join(f.state, "current.json"))).mode & 0o077, 0);
  assert.equal(cli(["journey", "use", "--state", f.state, "--root", f.root, "--host", "codex"]).status, 1);
  const inspection = json(["journey", "inspect", "--state", f.state, "--format", "json"]);
  assert.equal(inspection.local_evidence, undefined);
  assert.equal(cli(["journey", "reset", "--state", f.state, "--scope-id", created.scope.scope_id,
    "--expected", baseline.checkpoint_id]).status, 1);
});
test("failed exclusive CLI output leaves a recoverable checkpoint and preserves output bytes", async t => {
  const f = await fixture(t);
  json(["journey", "create", "--state", f.state, "--root", f.root, "--task", f.task, "--format", "json"]);
  const output = join(f.base, "existing.json");
  await writeFile(output, "Keep these original bytes.");
  assert.equal(cli(["journey", "use", "--state", f.state, "--host", "codex", "--output", output]).status, 1);
  assert.equal(await readFile(output, "utf8"), "Keep these original bytes.");
  const inspection = json(["journey", "inspect", "--state", f.state, "--format", "json"]);
  assert.ok(inspection.assessment.id);
  const retry = json(["journey", "use", "--state", f.state, "--host", "codex", "--format", "json"]);
  assert.equal(retry.state, "unchanged");
  assert.equal(retry.checkpoint_id, inspection.checkpoint_id);
});

const capsule: CapabilityEvidence = {
  schema_version: "bl-capability-evidence-0.1", rubric_id: "bl-work-evidence-0.1",
  assessment_basis: "unknown", human_involvement: "unknown", human_actions: [], quality_checks: [],
  change: "unknown", distinct_task_band: "unknown", benchmark: null,
};
const purposes: ContributionConsent = { public_story: true, benchmark_aggregation: false, community_learning: false,
  candidate_discovery: false, policy_version: "bl-sharing-0.2" };
async function contributionFixture(t: { after(fn: () => Promise<void>): void }) {
  const f = await fixture(t);
  const input = join(f.base, "candidate.json"), capability = join(f.base, "capability.json"), consent = join(f.base, "consent.json");
  const script = join(f.base, "fixture-reviewer.mjs"), config = join(f.base, "reviewers.json");
  const candidate = share();
  candidate.human_behaviors = candidate.human_behaviors.map(behavior => ({ ...behavior, state: "insufficient_evidence", rating: null }));
  await writeFile(input, JSON.stringify(candidate)); await writeFile(capability, JSON.stringify(capsule));
  await writeFile(consent, JSON.stringify(purposes));
  await writeFile(script, `import {writeFileSync} from "node:fs";
let text=""; for await(const chunk of process.stdin) text+=chunk;
writeFileSync(process.argv[2],text);
console.log(JSON.stringify({verdict:"allow",confidentiality:"clear",claim_support:"consistent",usefulness:"useful",reasons:[]}));
`);
  await writeFile(config, JSON.stringify(["one", "two"].map(id => ({
    id: "fixture_" + id, command: process.execPath, args: [script, join(f.base, id + ".json")],
  }))));
  const contribution = { schema_version: "bl-contribution-0.2", candidate, capability_evidence: capsule };
  return { ...f, input, capability, consent, config, contribution,
    args: ["draft-share", "--input", input, "--capability", capability, "--consent", consent],
    digest: computeContributionDigest(contribution, purposes) };
}
test("extended CLI blocks missing reviews, then reviews and confirms the whole contribution in one process", async t => {
  const f = await contributionFixture(t);
  const blockedPath = join(f.base, "blocked.json");
  assert.equal(cli([...f.args, "--output", blockedPath]).status, 1);
  const blocked = JSON.parse(await readFile(blockedPath, "utf8"));
  assert.equal(blocked.state, "local_unapproved_contribution");
  assert.equal(blocked.preparation.state, "blocked");
  assert.deepEqual(blocked.contribution, f.contribution);
  const approvedPath = join(f.base, "approved.json");
  const approved = cli([...f.args, "--reviewers", f.config, "--output", approvedPath, "--confirm", "--digest", f.digest]);
  assert.equal(approved.status, 0, approved.stderr);
  assert.doesNotMatch(approved.stdout, /local_handoff_ready/);
  const envelope = JSON.parse(await readFile(approvedPath, "utf8"));
  assert.equal(validateContributionApproval(envelope).valid, true);
  assert.equal(envelope.version, "bl-local-approval-0.2");
  for (const id of ["one", "two"]) {
    const request = JSON.parse(await readFile(join(f.base, id + ".json"), "utf8"));
    assert.deepEqual(Object.keys(request).sort(), ["contribution", "instructions", "policy_version"]);
    assert.deepEqual(request.contribution, f.contribution);
    assert.equal(request.candidate, undefined);
  }
  await writeFile(f.consent, JSON.stringify({ ...purposes, candidate_discovery: true }));
  const stale = join(f.base, "stale.json");
  assert.equal(cli([...f.args, "--reviewers", f.config, "--output", stale, "--confirm", "--digest", f.digest]).status, 1);
  await assert.rejects(readFile(stale), { code: "ENOENT" });
});
test("extended CLI uses draft.2 attribution checks instead of accepting unsupported observed humans", async t => {
  const f = await contributionFixture(t);
  await writeFile(f.input, JSON.stringify(share()));
  const output = join(f.base, "unsupported-attribution.json");
  const result = cli([...f.args, "--output", output, "--reviewers", f.config]);
  assert.equal(result.status, 1);
  const blocked = JSON.parse(await readFile(output, "utf8"));
  assert.ok(blocked.findings.some((finding: { code: string }) => finding.code === "observed_human_attribution_required"));
  await assert.rejects(readFile(join(f.base, "one.json")), { code: "ENOENT" });
});
test("extended handoff requires explicit confirmation/target and expires locally without opening a browser", async t => {
  const f = await contributionFixture(t);
  const out = join(f.base, "approved.json");
  assert.equal(cli([...f.args, "--output", out, "--handoff", "--target-origin", "http://127.0.0.1:3100"]).status, 1);
  assert.equal(cli([...f.args, "--output", out, "--reviewers", f.config, "--confirm", "--digest", f.digest,
    "--handoff", "--target-origin", "https://unselected.example"]).status, 1);
  const result = cli([...f.args, "--output", out, "--reviewers", f.config, "--confirm", "--digest", f.digest,
    "--handoff", "--target-origin", "http://127.0.0.1:3100", "--ttl-ms", "1000"]);
  assert.equal(result.status, 0, result.stderr);
  const ready = JSON.parse(result.stdout.slice(result.stdout.indexOf("\n") + 1));
  assert.equal(ready.state, "local_handoff_ready");
  assert.match(ready.url, /^http:\/\/127\.0\.0\.1:\d+\//);
  assert.doesNotMatch(ready.url, /candidate|schema_version|capability_evidence/);
  await assert.rejects(fetch(ready.url, { signal: AbortSignal.timeout(1000) }));
});
