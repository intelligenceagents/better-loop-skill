import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, realpath, rename, symlink, link, lstat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  applyCoaching, coachCommand, parseWorkingPreferences, planCoaching, rollbackCoaching, validateCoachPlan,
} from "../packages/cli/src/coach.js";
import { writePrivateOutput } from "../packages/cli/src/local-files.js";
import type { Host } from "../packages/core/src/index.js";

const starterPath = new URL("../skills/better-loop/references/working-preferences.example.json", import.meta.url);
async function starter() { return JSON.parse(await readFile(starterPath, "utf8")); }
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const base = await realpath(await mkdtemp(join(tmpdir(), "better-loop-coach-")));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, "selected-task");
  await mkdir(root);
  const preferencesFile = join(base, "chosen-preferences.json"), promptFile = join(base, "chosen-prompt.txt");
  await writeFile(preferencesFile, JSON.stringify(await starter()));
  await writeFile(promptFile, '\uFEFFReturn exactly {"total":3} as JSON. No commentary.\r\nRetain this literal `@/not-an-import` in the task.\r\n');
  return { base, root, preferencesFile, promptFile };
}

test("strict preferences reject unknown versions, malformed choices and ambiguous or unsupported profiles", async () => {
  const good = await starter();
  assert.equal(parseWorkingPreferences(good).profiles.length, 2);
  for (const change of [
    { extra: true }, { schema_version: "future" }, { profiles: null }, { audience: "" }, { feedback: "x".repeat(401) },
    { verification_habits: [] }, { delegation_boundaries: Array(7).fill("one") },
    { challenge_id: "pretend-challenge" }, { audience: "\ud800" }, { feedback: "line1\nline2" },
    { output_format: "line1\rline2" }, { audience: "\u2028" }, { feedback: "\u202econcealed" },
    { profiles: [good.profiles[0], good.profiles[0]] },
    { profiles: [{ ...good.profiles[0], model: "implicit" }] },
    { profiles: [{ ...good.profiles[0], host: "unknown" }] },
    { profiles: [{ ...good.profiles[0], adjustments: {} }] },
    { profiles: [{ ...good.profiles[0], adjustments: { challenge_id: null } }] },
  ]) assert.throws(() => parseWorkingPreferences({ ...good, ...change }), JSON.stringify(change));
  const { profiles: _profiles, challenge_id: _challenge, ...minimal } = good;
  assert.equal(parseWorkingPreferences(minimal).challenge_id, null);
  assert.deepEqual(parseWorkingPreferences(minimal).profiles, []);
});

for (const selectedHost of ["codex", "claude_code"] as const) test(`${selectedHost}: exact scoped plan, apply and byte-preserving rollback in a non-Git task directory`, async t => {
  const f = await fixture(t);
  const target = join(f.root, selectedHost === "codex" ? "AGENTS.md" : "CLAUDE.md");
  const before = "\uFEFF# Existing chosen instructions\r\nRetain the original exact-output contract.\r\nNo terminal newline";
  await writeFile(target, before, { mode: 0o640 });
  const preferenceBytes = await readFile(f.preferencesFile), promptBytes = await readFile(f.promptFile);
  const profile = selectedHost === "codex" ? "codex-default" : "claude-default";
  const plan = await planCoaching({ ...f, host: selectedHost, profile });
  assert.equal(plan.destination, target);
  assert.equal(plan.profile?.id, profile);
  assert.equal(plan.profile?.model_label, null);
  assert.equal(plan.method, "selected_preferences_template_not_semantic_diagnosis");
  assert.equal(plan.progress_credit, false);
  assert.equal(plan.prompt!.original, promptBytes.toString());
  assert.ok(plan.proposed_prompt.startsWith(promptBytes.toString() + "\n\n"));
  assert.match(plan.proposed_prompt, /exact output format, schema and no-commentary/);
  assert.ok(plan.instruction_plan.after.startsWith(before + "\r\n\r\n"));
  assert.ok(!/(?<!\r)\n/.test(plan.instruction_plan.after));
  assert.deepEqual(validateCoachPlan(plan), plan);
  assert.equal(await readFile(target, "utf8"), before, "plan is not application");
  await assert.rejects(applyCoaching({ ...f, plan, approvedDigest: plan.instruction_plan.approval_digest }), /exact_coach_approval/);
  await applyCoaching({ ...f, plan, approvedDigest: plan.approval_digest });
  assert.equal(await readFile(target, "utf8"), plan.instruction_plan.after);
  assert.equal((await lstat(target)).mode & 0o777, 0o640);
  await rollbackCoaching({ root: f.root, plan, approvedDigest: plan.approval_digest });
  assert.deepEqual(await readFile(target), Buffer.from(before));
  assert.deepEqual(await readFile(f.preferencesFile), preferenceBytes);
  assert.deepEqual(await readFile(f.promptFile), promptBytes);
  assert.deepEqual(await readdir(f.root), [selectedHost === "codex" ? "AGENTS.md" : "CLAUDE.md"]);
});

test("base choices never auto-select a profile; selected overrides are explicit and host-bound", async t => {
  const f = await fixture(t);
  const prefs = await starter();
  prefs.profiles[0].adjustments = { feedback: "Compare the result with one explicit counterexample." };
  prefs.profiles[0].model_label = "Explicit local descriptive label";
  await writeFile(f.preferencesFile, JSON.stringify(prefs));
  const base = await planCoaching({ ...f, host: "codex" });
  assert.equal(base.profile, null);
  assert.equal(base.preferences.feedback, prefs.feedback);
  const chosen = await planCoaching({ ...f, host: "codex", profile: "codex-default" });
  assert.equal(chosen.preferences.feedback, prefs.profiles[0].adjustments.feedback);
  assert.equal(chosen.profile?.model_label, prefs.profiles[0].model_label);
  for (const profile of ["missing", "claude-default"]) await assert.rejects(planCoaching({ ...f, host: "codex", profile }), /profile_missing_or_wrong_host/);
  assert.equal((await planCoaching({ root: f.root, preferencesFile: f.preferencesFile, host: "claude_code" })).prompt, null);
});

for (const existing of [false, true]) test(`PERSON-01: apply and rollback reject cross-root replay (${existing ? "same existing bytes" : "new target"})`, async t => {
  const f = await fixture(t), other = join(f.base, "other-task");
  await mkdir(other);
  if (existing) for (const root of [f.root, other]) await writeFile(join(root, "AGENTS.md"), "Identical original.\n");
  const plan = await planCoaching({ ...f, host: "codex" });
  await assert.rejects(applyCoaching({ ...f, root: other, plan, approvedDigest: plan.approval_digest }), /coach_scope_mismatch/);
  if (existing) assert.equal(await readFile(join(other, "AGENTS.md"), "utf8"), "Identical original.\n");
  else assert.deepEqual(await readdir(other), []);
  await applyCoaching({ ...f, plan, approvedDigest: plan.approval_digest });
  await writeFile(join(other, "AGENTS.md"), plan.instruction_plan.after);
  await assert.rejects(rollbackCoaching({ root: other, plan, approvedDigest: plan.approval_digest }), /coach_scope_mismatch/);
  assert.equal(await readFile(join(other, "AGENTS.md"), "utf8"), plan.instruction_plan.after);
  await rollbackCoaching({ root: f.root, plan, approvedDigest: plan.approval_digest });
  if (!existing) assert.deepEqual(await readdir(f.root), []);
});

test("directory replacement at the same canonical path invalidates apply and rollback", async t => {
  const f = await fixture(t);
  const plan = await planCoaching({ ...f, host: "codex" });
  await rename(f.root, f.root + "-previous");
  await mkdir(f.root);
  await assert.rejects(applyCoaching({ ...f, plan, approvedDigest: plan.approval_digest }), /coach_scope_mismatch/);
  await writeFile(join(f.root, "AGENTS.md"), plan.instruction_plan.after);
  await assert.rejects(rollbackCoaching({ root: f.root, plan, approvedDigest: plan.approval_digest }), /coach_scope_mismatch/);
});

test("changed bytes and different equal-content preference/prompt selections invalidate apply", async t => {
  const f = await fixture(t);
  const plan = await planCoaching({ ...f, host: "codex" });
  const preferences = await readFile(f.preferencesFile), prompt = await readFile(f.promptFile);
  await writeFile(f.preferencesFile, Buffer.concat([preferences, Buffer.from("\n")]));
  await assert.rejects(applyCoaching({ ...f, plan, approvedDigest: plan.approval_digest }), /coach_preferences_changed/);
  await writeFile(f.preferencesFile, preferences);
  await writeFile(f.promptFile, Buffer.concat([prompt, Buffer.from("Changed task.")]));
  await assert.rejects(applyCoaching({ ...f, plan, approvedDigest: plan.approval_digest }), /coach_prompt_changed/);
  await writeFile(f.promptFile, prompt);
  const differentPreferences = join(f.base, "other-preferences.json"), differentPrompt = join(f.base, "other-prompt.txt");
  await writeFile(differentPreferences, preferences); await writeFile(differentPrompt, prompt);
  await assert.rejects(applyCoaching({ ...f, preferencesFile: differentPreferences, plan, approvedDigest: plan.approval_digest }), /coach_preferences_changed/);
  await assert.rejects(applyCoaching({ ...f, promptFile: differentPrompt, plan, approvedDigest: plan.approval_digest }), /coach_prompt_changed/);
  await assert.rejects(applyCoaching({ root: f.root, preferencesFile: f.preferencesFile, plan, approvedDigest: plan.approval_digest }), /exact_prompt_selection/);
  assert.deepEqual(await readdir(f.root), []);
});

test("rollback ignores changed/deleted preferences and prompt but refuses later Markdown edits", async t => {
  const f = await fixture(t), target = join(f.root, "CLAUDE.md");
  await writeFile(target, "Original.");
  const plan = await planCoaching({ ...f, host: "claude_code" });
  await applyCoaching({ ...f, plan, approvedDigest: plan.approval_digest });
  await rm(f.preferencesFile); await rm(f.promptFile);
  await writeFile(target, plan.instruction_plan.after + "\nA later independent edit.");
  await assert.rejects(rollbackCoaching({ root: f.root, plan, approvedDigest: plan.approval_digest }), /bytes_precondition/);
  await writeFile(target, plan.instruction_plan.after);
  await rollbackCoaching({ root: f.root, plan, approvedDigest: plan.approval_digest });
  assert.equal(await readFile(target, "utf8"), "Original.");
});

test("stale target and tampered envelope/destination/proposal never apply", async t => {
  const f = await fixture(t), target = join(f.root, "AGENTS.md");
  const plan = await planCoaching({ ...f, host: "codex" });
  for (const patch of [{ extra: true }, { destination: join(f.root, "CLAUDE.md") }, { proposed_prompt: "changed" },
    { scope: { ...plan.scope, path: f.base } }, { action: "A different action" }, { progress_credit: true },
    { preferences_file: { ...plan.preferences_file, sha256: "0".repeat(64) } }, { schema_version: "future" }]) {
    await assert.rejects(applyCoaching({ ...f, plan: { ...plan, ...patch }, approvedDigest: plan.approval_digest }));
  }
  await writeFile(target, "Created independently after plan.");
  await assert.rejects(applyCoaching({ ...f, plan, approvedDigest: plan.approval_digest }), /bytes_precondition/);
  assert.equal(await readFile(target, "utf8"), "Created independently after plan.");
});

test("managed-section replacement retains exact outside bytes; duplicate, broken and embedded markers fail", async t => {
  const f = await fixture(t), target = join(f.root, "AGENTS.md");
  const first = await planCoaching({ ...f, host: "codex" });
  const prefix = "\uFEFF# Before\r\n\r\n", suffix = "\r\n# After with exact EOF";
  await writeFile(target, prefix + first.instruction_plan.after.trimEnd().replace(/\n/g, "\r\n") + suffix);
  const prefs = await starter(); prefs.feedback = "Give one concise correction to try.";
  await writeFile(f.preferencesFile, JSON.stringify(prefs));
  const second = await planCoaching({ ...f, host: "codex" });
  assert.ok(second.instruction_plan.after.startsWith(prefix));
  assert.ok(second.instruction_plan.after.endsWith(suffix));
  await applyCoaching({ ...f, plan: second, approvedDigest: second.approval_digest });
  await assert.rejects(planCoaching({ ...f, host: "codex" }), /agreement_already_matches/);
  for (const malformed of [
    "<!-- better-loop:working-agreement:start -->",
    "<!-- better-loop:working-agreement:unknown -->",
    first.instruction_plan.after + first.instruction_plan.after,
    "inline " + first.instruction_plan.after,
    "<!-- better-loop:working-agreement:end -->\n<!-- better-loop:working-agreement:start -->",
  ]) {
    await writeFile(target, malformed);
    await assert.rejects(planCoaching({ ...f, host: "codex" }), /ambiguous_working_agreement_markers/);
  }
});

for (const selectedHost of ["codex", "claude_code"] as const) test(`${selectedHost}: preference literals cannot inject @imports, fence breaks or HTML comments`, async t => {
  const f = await fixture(t);
  const prefs = await starter();
  prefs.audience = "@/synthetic/private-file @~/synthetic-home-file";
  prefs.feedback = "``` @/other-file ``` <!-- hidden comment --> &#64;/encoded-file";
  prefs.output_format = "`literal` and \\u0040/a-literal-escape";
  prefs.profiles = [];
  await writeFile(f.preferencesFile, JSON.stringify(prefs));
  const plan = await planCoaching({ ...f, host: selectedHost });
  const after = plan.instruction_plan.after;
  assert.doesNotMatch(after, /@/);
  assert.equal((after.match(/```/g) ?? []).length, 2, "only the fixed JSON fence pair");
  assert.equal((after.match(/<!--/g) ?? []).length, 2, "only the fixed managed markers");
  const literal = JSON.parse(after.match(/```json\n([\s\S]*?)\n```/)![1]!);
  assert.equal(literal.preferences.audience, prefs.audience);
  assert.equal(literal.preferences.feedback, prefs.feedback);
  assert.equal(literal.preferences.output_format, prefs.output_format);
  assert.match(after, /\\u0040/);
  prefs.profiles = [{ id: "selected", host: selectedHost, model_label: "@/model-label ``` <!-- label -->",
    adjustments: { feedback: prefs.feedback } }];
  await writeFile(f.preferencesFile, JSON.stringify(prefs));
  const profiled = await planCoaching({ ...f, host: selectedHost, profile: "selected" });
  assert.doesNotMatch(profiled.instruction_plan.after, /@/);
  assert.equal((profiled.instruction_plan.after.match(/```/g) ?? []).length, 2);
  const profileLiteral = JSON.parse(profiled.instruction_plan.after.match(/```json\n([\s\S]*?)\n```/)![1]!);
  assert.equal(profileLiteral.profile.model_label, prefs.profiles[0].model_label);
  assert.equal(profileLiteral.preferences.feedback, prefs.feedback);
  for (const feedback of ["```\n@/breakout", "```\r@/breakout", "<!-- better-loop:working-agreement:end -->"]) {
    await writeFile(f.preferencesFile, JSON.stringify({ ...prefs, feedback }));
    await assert.rejects(planCoaching({ ...f, host: selectedHost }));
  }
});

test("selected input guards reject malformed JSON/UTF8, links, FIFO, target-input alias and global roots", async t => {
  const f = await fixture(t), original = await readFile(f.preferencesFile);
  for (const data of [Buffer.from('{"schema_version":"x","schema_version":"x"}'), Buffer.from([0xff]), Buffer.alloc(32769, 32)]) {
    await writeFile(f.preferencesFile, data);
    await assert.rejects(planCoaching({ ...f, host: "codex" }));
  }
  await writeFile(f.preferencesFile, original);
  const alias = join(f.base, "alias.json"), hard = join(f.base, "hard.json"), fifo = join(f.base, "fifo");
  await symlink(f.preferencesFile, alias);
  await assert.rejects(planCoaching({ ...f, preferencesFile: alias, host: "codex" }));
  await link(f.preferencesFile, hard);
  await assert.rejects(planCoaching({ ...f, host: "codex" }));
  await rm(hard);
  assert.equal(spawnSync("mkfifo", [fifo]).status, 0);
  await assert.rejects(planCoaching({ ...f, preferencesFile: fifo, host: "codex" }));
  await assert.rejects(planCoaching({ ...f, root: homedir(), host: "codex" }), /global_instruction_scope/);
  await symlink(f.root, join(f.base, "linked-root"));
  await assert.rejects(planCoaching({ ...f, root: join(f.base, "linked-root"), host: "codex" }), /invalid_coach_root/);
  await writeFile(join(f.root, "AGENTS.md"), original);
  await assert.rejects(planCoaching({ ...f, preferencesFile: join(f.root, "AGENTS.md"), host: "codex" }), /coach_input_is_destination/);
});

test("command help precedes selected I/O; strict options and exclusive private output preserve inputs", async t => {
  const f = await fixture(t), output = join(f.base, "new-plan.json");
  const result = await coachCommand(["plan", "--root", f.root, "--host", "codex", "--preferences", f.preferencesFile, "--prompt", f.promptFile, "--output", output]);
  assert.equal(result.output, output); assert.equal(result.markdown, false);
  await writePrivateOutput(output, JSON.stringify(result.value));
  assert.equal((await lstat(output)).mode & 0o777, 0o600);
  await assert.rejects(writePrivateOutput(output, "replacement"), { code: "EEXIST" });
  assert.deepEqual(await readdir(f.root), []);
  const help = await coachCommand(["apply", "--preferences", "/does-not-exist", "--help"]);
  assert.equal(help.markdown, true); assert.match(String(help.value), /Help reads no selected files/);
  for (const args of [["plan"], ["plan", "--network", "yes"], ["plan", "--root", f.root, "--root", f.root], ["execute"]]) await assert.rejects(coachCommand(args));
  await assert.rejects(coachCommand(["plan", "--root", f.root, "--host", "codex", "--preferences", f.preferencesFile, "--output", join(f.root, "AGENTS.md")]), /coach_output_is_destination/);
  const plan = validateCoachPlan(result.value);
  await coachCommand(["apply", "--root", f.root, "--preferences", f.preferencesFile, "--prompt", f.promptFile, "--plan", output, "--approve", plan.approval_digest]);
  await coachCommand(["rollback", "--root", f.root, "--plan", output, "--approve", plan.approval_digest]);
  assert.deepEqual(await readdir(f.root), []);
});

test("full coach command flow never requests network, models or journey state", async t => {
  const f = await fixture(t), marker = join(f.base, "forbidden-I-O"), guard = join(f.base, "guard.mjs");
  await writeFile(guard, `import fs from "node:fs";import http from "node:http";import https from "node:https";import net from "node:net";import cp from "node:child_process";import {syncBuiltinESMExports} from "node:module";
const fail=()=>{fs.appendFileSync(${JSON.stringify(marker)},"forbidden");throw Error("unexpected_external_call");};
globalThis.fetch=fail;for(const module of [http,https]){module.request=fail;module.get=fail;}net.connect=fail;net.createConnection=fail;
cp.spawn=fail;cp.exec=fail;cp.execFile=fail;cp.spawnSync=fail;cp.execFileSync=fail;syncBuiltinESMExports();`);
  const script = join(f.base, "offline.mjs"), module = new URL("../packages/cli/src/coach.ts", import.meta.url).href;
  await writeFile(script, `import {planCoaching,applyCoaching,rollbackCoaching} from ${JSON.stringify(module)};
await import(${JSON.stringify(new URL("file://" + guard).href)});
const input=${JSON.stringify({ root: f.root, preferencesFile: f.preferencesFile, promptFile: f.promptFile, host: "codex" as Host })};
const plan=await planCoaching(input);await applyCoaching({...input,plan,approvedDigest:plan.approval_digest});await rollbackCoaching({root:input.root,plan,approvedDigest:plan.approval_digest});`);
  const run = spawnSync(process.execPath, ["--import", "tsx", script], { encoding: "utf8", timeout: 15000 });
  assert.equal(run.status, 0, run.stderr);
  await assert.rejects(readFile(marker), { code: "ENOENT" });
  assert.deepEqual(await readdir(f.root), []);
});
