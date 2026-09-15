import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const entrypoint = resolve("packages/cli/dist/cli.js");
test("journey, selected journey action and sharing help exit before selected reads, writes or reviewers", async t => {
  const root = await mkdtemp(join(tmpdir(), "better-loop-help-fixture-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const guard = join(root, "guard.mjs");
  await writeFile(guard, `import fs from "node:fs/promises"; import cp from "node:child_process"; import {syncBuiltinESMExports} from "node:module";
for(const key of ["open","readFile","lstat","stat","writeFile","mkdir","unlink"]) {
 const original=fs[key]; fs[key]=function(path,...args) {
  if(String(path).includes("NEVER_SELECTED")) throw new Error("SELECTED_IO_DURING_HELP");
  return original.call(this,path,...args);
 };
}
cp.execFile=()=>{throw new Error("REVIEWER_DURING_HELP");};
syncBuiltinESMExports();
`);
  const selected = join(root, "NEVER_SELECTED");
  const cases = [
    ["journey", "--help", "--state", selected],
    ["journey", "create", "--help", "--task", selected, "--state", selected],
    ["journey", "use", "--help", "--state", selected],
    ["journey", "view", "--state", selected, "--output", selected, "--help"],
    ["draft-share", "--input", selected, "--reviewers", selected, "--output", selected, "--help"],
  ];
  for (const args of cases) {
    const result = spawnSync(process.execPath, ["--import", guard, entrypoint, ...args], { encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Better Loop/);
    assert.equal(result.stderr, "");
    assert.doesNotMatch(result.stdout, /NEVER_SELECTED|SELECTED_IO_DURING_HELP/);
    if (args[1] === "view") {
      assert.match(result.stdout, /journey view --state.*--output/);
      assert.doesNotMatch(result.stdout, /journey create --state/);
    }
  }
  assert.deepEqual(await readdir(root), ["guard.mjs"]);
  assert.ok((await readFile(guard, "utf8")).includes("REVIEWER_DURING_HELP"));
});
test("missing and invalid arguments provide safe current usage without echoing supplied secrets or paths", () => {
  for (const args of [
    ["journey", "view"], ["journey", "view", "--PRIVATE_SENTINEL", "/private/PRIVATE_SENTINEL"],
    ["draft-share"], ["draft-share", "--input"],
    ["journey", "PRIVATE_SENTINEL"], ["PRIVATE_SENTINEL"],
  ]) {
    const result = spawnSync(process.execPath, [entrypoint, ...args], { encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid or missing arguments/);
    assert.match(result.stderr, /--state|--input/);
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_SENTINEL/);
    if (args[1] === "view") assert.match(result.stderr, /journey view --state.*--output/);
  }
});
