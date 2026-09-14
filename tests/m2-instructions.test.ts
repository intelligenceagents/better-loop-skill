import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, readFile, mkdir, lstat, link, symlink, rm, readdir } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { createInstructionPlan, validateInstructionPlan } from "../packages/core/src/index.js";
import { applyInstructionChange, planInstructionChange, readSelectedFile, writePrivateOutput } from "../packages/cli/src/local-files.js";

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "better-loop-m2-instructions-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
test("instruction plan has exact reviewed diff, byte approval and byte-preserving rollback", async () => fixture(async root => {
  const before = "\uFEFF# Scoped synthetic instructions\r\nKeep the user's output schema.\r\n";
  const after = `${before}Check one relevant failure case.\r\n`;
  await writeFile(join(root, "AGENTS.md"), before, { mode: 0o640 });
  const plan = await planInstructionChange(root, "AGENTS.md", after);
  assert.match(plan.diff, /--- a\/AGENTS.md/);
  assert.match(plan.diff, /Check one relevant failure case/);
  assert.deepEqual(validateInstructionPlan(plan), plan);
  assert.equal(await readFile(join(root, "AGENTS.md"), "utf8"), before, "planning must not apply");
  await assert.rejects(applyInstructionChange(root, plan, "wrong"), /exact_instruction_approval/);
  await applyInstructionChange(root, plan, plan.approval_digest);
  assert.equal(await readFile(join(root, "AGENTS.md"), "utf8"), after);
  assert.equal((await lstat(join(root, "AGENTS.md"))).mode & 0o777, 0o640);
  await applyInstructionChange(root, plan, plan.approval_digest, "rollback");
  assert.deepEqual(await readFile(join(root, "AGENTS.md")), Buffer.from(before));
  assert.deepEqual(await readdir(root), ["AGENTS.md"]);
}));
test("stale content blocks apply and rollback without overwriting the independent change", async () => fixture(async root => {
  await writeFile(join(root, "CLAUDE.md"), "Original.\n");
  const plan = await planInstructionChange(root, "CLAUDE.md", "Proposed.\n");
  await writeFile(join(root, "CLAUDE.md"), "Independent edit.\n");
  await assert.rejects(applyInstructionChange(root, plan, plan.approval_digest), /bytes_precondition/);
  await assert.rejects(applyInstructionChange(root, plan, plan.approval_digest, "rollback"), /bytes_precondition/);
  assert.equal(await readFile(join(root, "CLAUDE.md"), "utf8"), "Independent edit.\n");
}));
test("creation and rollback remove only the exact new selected instruction file", async () => fixture(async root => {
  await mkdir(join(root, ".agents", "skills", "synthetic"), { recursive: true });
  const selected = ".agents/skills/synthetic/SKILL.md";
  const plan = await planInstructionChange(root, selected, "# Synthetic scoped skill\n");
  assert.equal(plan.before, null);
  assert.match(plan.diff, /--- \/dev\/null/);
  await applyInstructionChange(root, plan, plan.approval_digest);
  await applyInstructionChange(root, plan, plan.approval_digest, "rollback");
  await assert.rejects(readFile(join(root, selected)), { code: "ENOENT" });
  assert.ok((await lstat(join(root, ".agents", "skills", "synthetic"))).isDirectory());
}));
test("instruction paths cannot escape, target arbitrary files, or edit global configuration", async () => fixture(async root => {
  for (const path of ["../AGENTS.md", "/AGENTS.md", "src/app.ts", ".codex/config.toml", "skills/../SKILL.md", "skills/evil\nname/SKILL.md", "AGENTS.md/extra"]) {
    await assert.rejects(planInstructionChange(root, path, "changed"), /instruction_path/);
  }
  await assert.rejects(planInstructionChange(homedir(), "AGENTS.md", "changed"), /global_instruction_scope/);
  await assert.rejects(planInstructionChange("/", "AGENTS.md", "changed"), /global_instruction_scope/);
}));
test("symlink parents, symlink targets, hardlinks and changed plan bytes fail closed", async () => fixture(async root => {
  const outside = await mkdtemp(join(tmpdir(), "better-loop-m2-outside-"));
  try {
    await writeFile(join(outside, "AGENTS.md"), "Outside.\n");
    await symlink(join(outside, "AGENTS.md"), join(root, "AGENTS.md"));
    await assert.rejects(planInstructionChange(root, "AGENTS.md", "changed"), /regular_single_link/);
    await mkdir(join(root, ".agents"));
    await symlink(outside, join(root, ".agents", "skills"));
    await assert.rejects(planInstructionChange(root, ".agents/skills/fixture/SKILL.md", "changed"), /parent_not_contained/);
    await link(join(outside, "AGENTS.md"), join(root, "CLAUDE.md"));
    await assert.rejects(planInstructionChange(root, "CLAUDE.md", "changed"), /regular_single_link/);
    const plan = createInstructionPlan("AGENTS.md", "before", "after");
    assert.throws(() => validateInstructionPlan({ ...plan, after: "unapproved" }), /integrity_failed/);
    assert.throws(() => validateInstructionPlan({ ...plan, extra: true }), /invalid_instruction_plan/);
    assert.equal(await readFile(join(outside, "AGENTS.md"), "utf8"), "Outside.\n");
  } finally { await rm(outside, { recursive: true, force: true }); }
}));
test("replacing a parent with a symlink between plan and apply does not follow it", async () => fixture(async root => {
  const parent = join(root, "skills", "synthetic");
  await mkdir(parent, { recursive: true });
  await writeFile(join(parent, "SKILL.md"), "before");
  const plan = await planInstructionChange(root, "skills/synthetic/SKILL.md", "after");
  const outside = await mkdtemp(join(tmpdir(), "better-loop-m2-parent-"));
  try {
    await writeFile(join(outside, "SKILL.md"), "before");
    await rm(parent, { recursive: true });
    await symlink(outside, parent);
    await assert.rejects(applyInstructionChange(root, plan, plan.approval_digest), /parent_not_contained/);
    assert.equal(await readFile(join(outside, "SKILL.md"), "utf8"), "before");
  } finally { await rm(outside, { recursive: true, force: true }); }
}));
test("selected file IO is bounded, strict UTF8, exclusive mode 0600, and rejects links/directories", async () => fixture(async root => {
  const output = join(root, "private.json");
  await writePrivateOutput(output, '{"synthetic":true}\n');
  assert.equal((await lstat(output)).mode & 0o777, 0o600);
  await assert.rejects(writePrivateOutput(output, "overwrite"), { code: "EEXIST" });
  assert.equal(await readSelectedFile(output), '{"synthetic":true}\n');
  await assert.rejects(readSelectedFile(output, 2), /bounded_regular_file/);
  await assert.rejects(readSelectedFile(root), /bounded_regular_file/);
  await symlink(output, join(root, "alias"));
  await assert.rejects(readSelectedFile(join(root, "alias")));
  await writeFile(join(root, "invalid-utf8"), Buffer.from([0xc3, 0x28]));
  await assert.rejects(readSelectedFile(join(root, "invalid-utf8")));
}));
