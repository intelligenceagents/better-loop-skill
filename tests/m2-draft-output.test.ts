import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFile, mkdtemp, mkdir, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { computePreviewDigest } from "@better-loop/contracts";
import { computeContributionDigest, validateContributionApproval } from "@better-loop/evidence";
import { reservePrivateOutput } from "../packages/cli/src/local-files.js";
import { consent, share } from "./cases.js";

const entrypoint = resolve("packages/cli/dist/cli.js");
const cli = (args: string[]) => spawnSync(process.execPath, [entrypoint, ...args], { encoding: "utf8", timeout: 15000 });
async function setup(t: { after(fn: () => Promise<void>): void }, extended = false) {
  const root = await mkdtemp(join(tmpdir(), "better-loop-output-fixture-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = join(root, "candidate.json"), purposes = join(root, "purposes.json");
  const config = join(root, "reviewers.json"), script = join(root, "counted-fixture.mjs"), counter = join(root, "calls.jsonl");
  const candidate = share();
  const capsule = {
    schema_version: "bl-capability-evidence-0.1", rubric_id: "bl-work-evidence-0.1",
    assessment_basis: "unknown", human_involvement: "unknown", human_actions: [], quality_checks: [],
    change: "unknown", distinct_task_band: "unknown", benchmark: null,
  };
  if (extended) candidate.human_behaviors = candidate.human_behaviors.map(item => ({ ...item, state: "insufficient_evidence", rating: null }));
  const choices = extended ? { public_story: true, benchmark_aggregation: false, community_learning: false,
    candidate_discovery: false, policy_version: "bl-sharing-0.2" } : consent();
  await writeFile(input, JSON.stringify(candidate)); await writeFile(purposes, JSON.stringify(choices));
  await writeFile(counter, "");
  // Counterfeit reviewers verify transport/order only; they provide no semantic evidence.
  await writeFile(script, `import {appendFileSync,statSync} from "node:fs";
const [counter,output,mode]=process.argv.slice(2);
let observed={unavailable:true};
try {const reserved=statSync(output); observed={size:reserved.size,mode:reserved.mode&0o777};} catch {}
appendFileSync(counter,JSON.stringify(observed)+"\\n");
if(observed.unavailable) process.exit(1);
for await(const _ of process.stdin) {}
console.log(mode==="malformed" ? "fixture-invalid-json" : JSON.stringify({verdict:"allow",confidentiality:"clear",claim_support:"consistent",usefulness:"useful",reasons:[]}));
`);
  const args = ["draft-share", "--input", input, "--consent", purposes, "--reviewers", config];
  if (extended) {
    const capability = join(root, "capsule.json");
    await writeFile(capability, JSON.stringify(capsule)); args.push("--capability", capability);
  }
  const digest = extended
    ? computeContributionDigest({ schema_version: "bl-contribution-0.2", candidate, capability_evidence: capsule }, choices)
    : computePreviewDigest(candidate, consent());
  const configure = (output: string, mode = "allow") => writeFile(config, JSON.stringify(["one", "two"].map(id => ({
    id: "fixture_" + id, command: process.execPath, args: [script, counter, output, mode],
  }))));
  const calls = async () => (await readFile(counter, "utf8")).split("\n").filter(Boolean).map(line => JSON.parse(line));
  return { root, input, config, counter, args, digest, configure, calls };
}

for (const extended of [false, true]) {
  const mode = extended ? "contribution" : "legacy";
  test(`${mode}: occupied, linked and invalid output destinations start zero reviewers`, async t => {
    const f = await setup(t, extended);
    const occupied = join(f.root, "occupied.json"), directory = join(f.root, "directory");
    const linked = join(f.root, "linked.json"), dangling = join(f.root, "dangling.json");
    await writeFile(occupied, "PREEXISTING_OUTPUT"); await mkdir(directory);
    await symlink(occupied, linked); await symlink(join(f.root, "missing-target"), dangling);
    for (const output of [occupied, directory, linked, dangling, join(f.root, "missing-parent", "new.json"), join(occupied, "new.json")]) {
      await f.configure(output);
      for (const extra of [[], ["--confirm", "--digest", f.digest]]) {
        const result = cli([...f.args, "--output", output, ...extra]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /could not reserve --output.*No reviewer was started/s);
        assert.doesNotMatch(result.stdout + result.stderr, new RegExp(f.root));
      }
      assert.deepEqual(await f.calls(), []);
    }
    assert.equal(await readFile(occupied, "utf8"), "PREEXISTING_OUTPUT");
    await assert.rejects(stat(join(f.root, "missing-target")), { code: "ENOENT" });
  });
  test(`${mode}: a private empty reservation precedes both reviews and completed files stay immutable`, async t => {
    const f = await setup(t, extended);
    const preview = join(f.root, "preview.json"), approved = join(f.root, "approved.json");
    await f.configure(preview);
    const result = cli([...f.args, "--output", preview]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(await readFile(preview, "utf8")).preparation.state, "ready_for_confirmation");
    const previewBytes = await readFile(preview);
    await f.configure(approved);
    const confirmed = cli([...f.args, "--output", approved, "--confirm", "--digest", f.digest]);
    assert.equal(confirmed.status, 0, confirmed.stderr);
    const approval = JSON.parse(await readFile(approved, "utf8"));
    assert.equal(approval.preview_digest, f.digest);
    if (extended) assert.equal(validateContributionApproval(approval).valid, true);
    else assert.equal(approval.version, "bl-local-approval-0.1");
    assert.equal((await stat(approved)).mode & 0o777, 0o600);
    assert.deepEqual(await f.calls(), Array.from({ length: 4 }, () => ({ size: 0, mode: 0o600 })));
    assert.equal(cli([...f.args, "--output", preview]).status, 1);
    assert.deepEqual(await readFile(preview), previewBytes);
    assert.equal((await f.calls()).length, 4);
  });
}

test("unavailable review retains a completed unapproved draft instead of removing it as an abandoned reservation", async t => {
  const f = await setup(t, true), output = join(f.root, "blocked.json");
  await f.configure(output, "malformed");
  assert.equal(cli([...f.args, "--output", output]).status, 1);
  const draft = JSON.parse(await readFile(output, "utf8"));
  assert.equal(draft.state, "local_unapproved_contribution");
  assert.equal(draft.preparation.state, "blocked");
  assert.equal((await f.calls()).length, 2);
  assert.equal((await stat(output)).mode & 0o777, 0o600);
});
test("malformed input/configuration cleans up unused reservations and calls no reviewer", async t => {
  const f = await setup(t);
  const output = join(f.root, "failed.json");
  await writeFile(f.config, "{}");
  assert.equal(cli([...f.args, "--output", output]).status, 1);
  await assert.rejects(stat(output), { code: "ENOENT" });
  await f.configure(output);
  await writeFile(f.input, "{bad json");
  assert.equal(cli([...f.args, "--output", output]).status, 1);
  await assert.rejects(stat(output), { code: "ENOENT" });
  assert.deepEqual(await f.calls(), []);
});
test("mismatched confirmation cleans up its reservation without manufacturing an approval", async t => {
  const f = await setup(t, true), output = join(f.root, "not-approved.json");
  await f.configure(output);
  assert.equal(cli([...f.args, "--output", output, "--confirm", "--digest", "0".repeat(64)]).status, 1);
  await assert.rejects(stat(output), { code: "ENOENT" });
  assert.equal((await f.calls()).length, 2);
});
test("reservation cleanup preserves replaced or externally edited files and release is idempotent", async t => {
  const f = await setup(t);
  for (const replace of [false, true]) {
    const output = join(f.root, `changed-${replace}.json`);
    const reservation = await reservePrivateOutput(output);
    if (replace) { await unlink(output); await writeFile(output, "OTHER_OWNER"); }
    else await appendFile(output, "OTHER_OWNER");
    await assert.rejects(reservation.write("MUST_NOT_REPLACE"), /output_reservation_changed/);
    await reservation.release(); await reservation.release();
    assert.equal(await readFile(output, "utf8"), "OTHER_OWNER");
  }
  const abandoned = join(f.root, "abandoned.json");
  const reservation = await reservePrivateOutput(abandoned);
  await reservation.release(); await reservation.release();
  await assert.rejects(stat(abandoned), { code: "ENOENT" });
});
