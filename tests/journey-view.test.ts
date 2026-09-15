import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, realpath, rm, rename, symlink, stat, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createScope, useJourney, recordAssessment, recordOutcome, reviewJourney, updateScope, inspectJourney } from "../packages/journey/src/index.js";
import type { FollowupCheck } from "../packages/journey/src/index.js";
import { writeJourneyView, renderJourneyView, practiceStates } from "../packages/cli/src/journey-view.js";
import { journeyProgress } from "../packages/cli/src/journey-progress.js";

const task = { family: "software" as const, goal: "Automated viewer regression fixture", acceptance_criteria: ["Retain unknowns and actual bound results."] };
const report = { summary: "Fixture host input; no model call.", diagnosis: "Keep the failure check.", next_action: "Check the selected failure.", acceptance_check: "Retain the observed result.", limitations: ["Persistence fixture only."] };
const check: FollowupCheck = { content_origin: "work_derived", change: "followup", comparison: "comparable", outcome: "regressed", quality_floor: "not_met", critical_regression: "observed", check_result: "not_met" };
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const base = await realpath(await mkdtemp(join(tmpdir(), "better-loop-view-test-")));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, "repo"); await mkdir(root);
  const git = (...args: string[]) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-C", root, ...args], {
    env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }, stdio: "pipe",
  });
  git("init", "--quiet", "--initial-branch=main", "--template=");
  const lines = Array.from({ length: 70 }, (_, i) => `export const line${i} = ${i};`);
  await writeFile(join(root, "work.ts"), lines.join("\n")); git("add", "--", "work.ts");
  const stateDirectory = join(base, "state");
  await createScope({ stateDirectory, roots: [root], task });
  return { base, root, stateDirectory, lines };
}
async function fileBytes(state: string): Promise<unknown[]> {
  return Promise.all((await readdir(state, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name)).map(async entry =>
    [entry.name, entry.isDirectory() ? await fileBytes(join(state, entry.name)) : await readFile(join(state, entry.name), "utf8")]));
}

test("saved view is readonly even with unavailable live repository; defaults omit raw source and hashes", async t => {
  const f = await fixture(t);
  const baseline = await useJourney({ ...f, host: "codex" });
  const saved = await recordAssessment({ ...f, host: "codex", expectedCheckpoint: baseline.checkpoint_id, report });
  const before = await fileBytes(f.stateDirectory);
  await rename(f.root, join(f.base, "offline-repo"));
  const review = await reviewJourney(f.stateDirectory);
  assert.equal(review.current.checkpoint_id, saved.checkpoint_id);
  assert.equal(review.comparison.state, "baseline");
  assert.equal(review.comparison.before_saved_at, null);
  assert.equal(review.comparison.changes[0]?.path, "work.ts");
  assert.ok(review.comparison.changes.every(change => change.excerpt === "" && !("before" in change) && !("after" in change)));
  const html = renderJourneyView(review);
  assert.doesNotMatch(html, /export const line0|snapshot_digest|evidence_hash/);
  assert.match(html, /Not established yet/);
  assert.match(html, /Unknown is not a zero score/);
  assert.deepEqual(await fileBytes(f.stateDirectory), before);
});

test("selected saved multi-hunk before/after keeps distant edits and ignores unsaved live changes", async t => {
  const f = await fixture(t); await useJourney({ ...f, host: "codex" });
  f.lines[2] = "export const actualFirstEdit = true;"; f.lines[66] = "export const actualLastEdit = true;";
  await writeFile(join(f.root, "work.ts"), f.lines.join("\n"));
  const changed = await useJourney({ ...f, host: "claude_code" });
  await writeFile(join(f.root, "work.ts"), "UNSAVED_PRIVATE_SENTINEL");
  const review = await reviewJourney(f.stateDirectory, { includeChanges: true, excerptBytes: 1500, excerptFiles: 1 });
  assert.equal(review.current.checkpoint_id, changed.checkpoint_id);
  assert.equal(review.comparison.state, "delta");
  const text = review.comparison.changes[0]!.excerpt;
  assert.match(text, /actualFirstEdit/); assert.match(text, /actualLastEdit/);
  assert.doesNotMatch(text, /-export const line35/); assert.doesNotMatch(text, /UNSAVED_PRIVATE_SENTINEL/);
  assert.ok(Buffer.byteLength(text) <= 1500);
  assert.equal(review.comparison.source_changes_are_task_improvement, false);
  const blank = await reviewJourney(f.stateDirectory, { includeChanges: true, excerptBytes: 0 });
  assert.equal(blank.comparison.changes[0]?.excerpt, "");
  await assert.rejects(reviewJourney(f.stateDirectory, { excerptBytes: -1 }));
});

test("view requires new explicit HTML outside state, preserves bytes and permissions, rejects aliases into state", async t => {
  const f = await fixture(t); await useJourney({ ...f, host: "codex" });
  const before = await fileBytes(f.stateDirectory), output = join(f.base, "report.html");
  const receipt = await writeJourneyView({ ...f, output });
  assert.equal(receipt.state_changed, false); assert.equal(receipt.browser_opened, false);
  assert.equal((await stat(output)).mode & 0o777, 0o600);
  const original = await readFile(output);
  await assert.rejects(writeJourneyView({ ...f, output }), { code: "EEXIST" });
  assert.deepEqual(await readFile(output), original);
  await assert.rejects(writeJourneyView({ ...f, output: join(f.stateDirectory, "report.html") }), /outside_state/);
  await symlink(f.stateDirectory, join(f.base, "alias"));
  await assert.rejects(writeJourneyView({ ...f, output: join(f.base, "alias", "report.html") }), /outside_state/);
  await symlink(output, join(f.base, "linked.html"));
  await assert.rejects(writeJourneyView({ ...f, output: join(f.base, "linked.html") }));
  await assert.rejects(writeJourneyView({ ...f, output: join(f.base, "report.txt") }), /explicit_html/);
  assert.deepEqual(await fileBytes(f.stateDirectory), before);
});

test("untrusted HTML/textarea/CSS/URL text remains literal and CSP permits only exact embedded style", async t => {
  const f = await fixture(t); const first = await useJourney({ ...f, host: "codex" });
  const malicious = '</textarea><script>globalThis.OWNED=1</script><img src="https://example.invalid/leak" onerror="alert(1)"> & `*_[x]';
  await recordAssessment({ ...f, expectedCheckpoint: first.checkpoint_id, host: "claude_code", report: { ...report, summary: malicious, next_action: malicious } });
  const html = renderJourneyView(await reviewJourney(f.stateDirectory));
  assert.doesNotMatch(html, /<script|<img|onerror="|href="https?:|src="https?:/i);
  assert.match(html, /&lt;script&gt;globalThis.OWNED=1/);
  assert.match(html, /&amp; `\*_\[x\]/);
  const css = html.match(/<style>([\s\S]*?)<\/style>/)![1]!;
  assert.ok(html.includes("sha256-" + createHash("sha256").update(css).digest("base64")));
  assert.match(html, /script-src &#39;none&#39;/);
  assert.equal((html.match(/<textarea /g) ?? []).length, 2);
});

test("negative bound later check earns honest practice; changed advice locks current states but preserves history", async t => {
  const f = await fixture(t); const first = await useJourney({ ...f, host: "codex" });
  const saved = await recordAssessment({ ...f, expectedCheckpoint: first.checkpoint_id, host: "codex", report });
  const ack = await recordOutcome({ ...f, expectedCheckpoint: saved.checkpoint_id, recommendationId: saved.host_assessment!.id, status: "not_tried", note: "I chose this check.", reflectionCompleted: true, contentOrigin: "work_derived" });
  const checkEvidenceFile = join(f.base, "check.txt"); await writeFile(checkEvidenceFile, "Automated regression fixture result: selected failure persists.");
  const outcome = await recordOutcome({ ...f, expectedCheckpoint: ack.checkpoint_id, recommendationId: saved.host_assessment!.id, status: "did_not_help", note: "The selected failure persists.", check, checkEvidenceFile });
  const review = await reviewJourney(f.stateDirectory), progress = journeyProgress(review.current);
  assert.deepEqual(practiceStates(progress).map(card => card.earned), [true, true, true]);
  assert.equal(progress.checked_outcomes[0]?.outcome, "regressed");
  const html = renderJourneyView(review);
  assert.match(html, /Choose a smaller alternative/); assert.match(html, /Regressed/);
  assert.doesNotMatch(html, /Reported improvement/);
  await recordAssessment({ ...f, expectedCheckpoint: outcome.checkpoint_id, host: "claude_code", report: { ...report, next_action: "A materially different action." } });
  const revised = await reviewJourney(f.stateDirectory);
  assert.deepEqual(practiceStates(journeyProgress(revised.current)).map(card => card.earned), [false, false, false]);
  assert.match(renderJourneyView(revised), /Checked loop at this historical checkpoint/);
});

for (const condition of ["same_evidence", "synthetic", "copy", "unknown"] as const) test(`viewer does not credit ${condition} as later checked evidence`, async t => {
  const f = await fixture(t); const first = await useJourney({ ...f, host: "codex" });
  let expected = first.checkpoint_id;
  if (condition !== "same_evidence") {
    const ack = await recordOutcome({ ...f, expectedCheckpoint: expected, recommendationId: first.assessment!.id, status: "not_tried", note: "", reflectionCompleted: true, contentOrigin: "work_derived" });
    expected = ack.checkpoint_id;
  }
  const checkEvidenceFile = join(f.base, "check.txt"); await writeFile(checkEvidenceFile, "Automated fixture only.");
  const recorded = await recordOutcome({ ...f, expectedCheckpoint: expected, recommendationId: first.assessment!.id, status: "inconclusive", note: "Fixture outcome.", checkEvidenceFile,
    reflectionCompleted: true, contentOrigin: condition === "synthetic" ? "synthetic" : "work_derived", check: { ...check, content_origin: condition === "synthetic" ? "synthetic" : "work_derived", change: condition === "copy" ? "copy" : "followup", comparison: condition === "unknown" ? "unknown" : "comparable" } });
  await recordOutcome({ ...f, expectedCheckpoint: recorded.checkpoint_id, recommendationId: first.assessment!.id, status: "inconclusive", note: "Rephrased note.", checkEvidenceFile, check: { ...check, content_origin: condition === "synthetic" ? "synthetic" : "work_derived", change: condition === "copy" ? "copy" : "followup", comparison: condition === "unknown" ? "unknown" : "comparable" } });
  const progress = journeyProgress((await reviewJourney(f.stateDirectory)).current);
  assert.equal(practiceStates(progress)[1]?.earned, false); assert.equal(practiceStates(progress)[2]?.earned, false);
});

test("scope switch resets comparable presentation; corruption blocks output", async t => {
  const f = await fixture(t); const first = await useJourney({ ...f, host: "codex" });
  await updateScope({ ...f, expectedCheckpoint: first.checkpoint_id, roots: [f.root], task: { ...task, goal: "Different explicitly chosen task" } });
  const review = await reviewJourney(f.stateDirectory);
  assert.equal(review.comparison.state, "unassessed"); assert.equal(review.comparison.before_saved_at, null);
  assert.match(renderJourneyView(review), /Comparability is invalidated/);
  await writeFile(join(f.stateDirectory, "current.json"), "corrupt");
  const output = join(f.base, "never.html");
  await assert.rejects(writeJourneyView({ ...f, output }));
  await assert.rejects(stat(output), { code: "ENOENT" });
});

test("separate CLI view process writes HTML and only a receipt; no new checkpoint or raw excerpts", async t => {
  const f = await fixture(t); await useJourney({ ...f, host: "codex" });
  const before = await inspectJourney(f.stateDirectory), output = join(f.base, "cli-view.html");
  const invoke = (args: string[]) => execFileSync(process.execPath, [resolve("packages/cli/dist/cli.js"), "journey", "view", "--state", f.stateDirectory, ...args], { encoding: "utf8", stdio: "pipe" });
  const receipt = JSON.parse(invoke(["--output", output]));
  assert.equal(receipt.state, "written_private_html_view");
  assert.equal(receipt.checkpoint_id, before.checkpoint_id);
  assert.match(await readFile(output, "utf8"), /^<!doctype html>/);
  assert.doesNotMatch(await readFile(output, "utf8"), /export const line0/);
  assert.equal((await inspectJourney(f.stateDirectory)).checkpoint_id, before.checkpoint_id);
  assert.throws(() => invoke([]));
  assert.throws(() => invoke(["--output", join(f.base, "bad.html"), "--excerpt-bytes", "1000"]));
});

test("unchanged CLI preview stays concise without replacing exact stored advice or reasking a supplied outcome", async t => {
  const { renderJourney } = await import("../packages/cli/src/journey-cli.js");
  const f = await fixture(t); const first = await useJourney({ ...f, host: "codex" });
  const long = "Acceptance must retain every exact required detail. ".repeat(30);
  const saved = await recordAssessment({ ...f, expectedCheckpoint: first.checkpoint_id, host: "codex", report: { ...report, next_action: long, acceptance_check: long } });
  await recordOutcome({ ...f, expectedCheckpoint: saved.checkpoint_id, recommendationId: saved.host_assessment!.id, status: "declined", note: "Not useful for this task." });
  const current = await inspectJourney(f.stateDirectory), progress = journeyProgress(current);
  const text = renderJourney({ state: "unchanged", progress });
  assert.ok(text.split(/\s+/).length < 180);
  assert.match(text, /full wording in inspect\/view/);
  assert.doesNotMatch(text, /Which previous advice/);
  assert.equal(progress.acceptance_check, long);
});

test("portable prompt artifact supplies distinct static first/multiple/return/view/share requests for both hosts", async () => {
  const data = JSON.parse(await readFile("skills/better-loop/references/host-prompts.json", "utf8"));
  assert.equal(data.schema_version, "bl-host-prompts-0.1");
  for (const host of ["codex", "claude_code"]) {
    assert.deepEqual(data.hosts[host].map((item: { id: string }) => item.id), ["first_current", "first_multiple", "return", "view", "share"]);
    for (const item of data.hosts[host]) {
      assert.doesNotMatch(item.prompt, /\/Users\/|curl |execFile|OTP=[^ ]|https:\/\//);
      assert.match(item.prompt, /Respect this session/);
    }
    assert.match(data.hosts[host].find((item: { id: string }) => item.id === "view").prompt, /{{output_json}}/);
    assert.match(data.hosts[host].find((item: { id: string }) => item.id === "return").prompt, /no new assessment/i);
    assert.match(data.hosts[host].find((item: { id: string }) => item.id === "share").prompt, /all choices start false/);
  }
});

test("multiple selected repositories remain distinguishable; excluded source stays out even with excerpts requested", async t => {
  const f = await fixture(t);
  const other = join(f.base, "second"); await mkdir(other);
  execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-C", other, "init", "--quiet", "--initial-branch=main", "--template="], { stdio: "pipe" });
  await writeFile(join(other, "work.ts"), "export const secondRepository = true;");
  await writeFile(join(other, ".env"), "EXCLUDED_PRIVATE_SENTINEL");
  execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-C", other, "add", "--", "work.ts", ".env"], { stdio: "pipe" });
  const stateDirectory = join(f.base, "multiple-state");
  await createScope({ stateDirectory, roots: [f.root, other], task });
  await useJourney({ stateDirectory, host: "claude_code" });
  const { withLock } = await import("../packages/journey/src/store.js");
  const review = await withLock(stateDirectory, () => reviewJourney(stateDirectory, { includeChanges: true, excerptBytes: 1200 }));
  assert.equal(review.current.scope.roots.length, 2);
  assert.equal(review.comparison.changes.length, 2);
  assert.deepEqual(review.comparison.changes.map(change => change.repository).sort(), [0, 1]);
  const html = renderJourneyView(review);
  assert.match(html, /Repository 1 · work.ts/); assert.match(html, /Repository 2 · work.ts/);
  assert.doesNotMatch(html, /EXCLUDED_PRIVATE_SENTINEL/);
  assert.ok(review.comparison.changes.reduce((n, change) => n + Buffer.byteLength(change.excerpt), 0) <= 1200);
});
