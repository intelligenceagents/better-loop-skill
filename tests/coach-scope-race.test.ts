import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { applyCoaching, planCoaching, rollbackCoaching } from "../packages/cli/src/coach.js";
import { planInstructionChange } from "../packages/cli/src/local-files.js";

for (const direction of ["apply", "rollback"] as const) test(`expected scope closes the coach-check → helper-capture ${direction} race`, async t => {
  const base = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "coach-root-race-")));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = join(base, "selected"), preferencesFile = join(base, "preferences.json");
  await fs.mkdir(root);
  await fs.writeFile(preferencesFile, await fs.readFile(new URL("../skills/better-loop/references/working-preferences.example.json", import.meta.url)));
  const before = "Original scoped instructions.\n", target = join(root, "AGENTS.md");
  await fs.writeFile(target, before);
  const plan = await planCoaching({ root, preferencesFile, host: "codex" });
  if (direction === "rollback") await applyCoaching({ root, preferencesFile, plan, approvedDigest: plan.approval_digest });
  const expected = direction === "apply" ? before : plan.instruction_plan.after;
  const originalLstat = fs.lstat;
  let rootReads = 0, replaced = false;
  // Return the old identity for the wrapper's final lstat, then replace its directory
  // before instructionTarget performs the helper's own first lookup.
  fs.lstat = (async (path: Parameters<typeof fs.lstat>[0], options: any) => {
    const stat = await originalLstat(path, options);
    if (String(path) === root && ++rootReads === (direction === "apply" ? 4 : 2)) {
      await fs.rename(root, join(base, "retained-original"));
      await fs.mkdir(root);
      await fs.writeFile(target, expected);
      replaced = true;
    }
    return stat;
  }) as typeof fs.lstat;
  syncBuiltinESMExports();
  try {
    const run = direction === "apply"
      ? applyCoaching({ root, preferencesFile, plan, approvedDigest: plan.approval_digest })
      : rollbackCoaching({ root, plan, approvedDigest: plan.approval_digest });
    await assert.rejects(run, /instruction_scope_changed/);
  } finally { fs.lstat = originalLstat; syncBuiltinESMExports(); }
  assert.equal(replaced, true, "the test must hit the check-to-use seam");
  assert.equal(await fs.readFile(target, "utf8"), expected);
  assert.equal(await fs.readFile(join(base, "retained-original/AGENTS.md"), "utf8"), expected);
  assert.deepEqual(await fs.readdir(root), ["AGENTS.md"], "no replacement-directory lock, temp or edit");
});

test("planning carries the expected scope through helper capture too", async t => {
  const base = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "coach-plan-scope-")));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = join(base, "selected"); await fs.mkdir(root);
  const stat = await fs.lstat(root, { bigint: true });
  const expected = { path: root, device: stat.dev.toString(), inode: stat.ino.toString() };
  await fs.rename(root, join(base, "retained")); await fs.mkdir(root);
  await assert.rejects(planInstructionChange(root, "CLAUDE.md", "Proposed.", expected), /instruction_scope_changed/);
  assert.deepEqual(await fs.readdir(root), []);
});
