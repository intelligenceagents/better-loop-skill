import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { consent, share } from "./cases.js";
import { computePreviewDigest } from "../packages/contracts/src/index.js";

function cli(command: string, input: string) {
  return spawnSync(process.execPath, ["packages/contracts/dist/cli.js", command, "-"], { input, encoding: "utf8" });
}
test("CLI validates without echoing the candidate", () => {
  const result = cli("share", JSON.stringify(share()));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { valid: true, errors: [] });
});
test("CLI canonicalizes and computes digest from a strict envelope", () => {
  assert.equal(cli("canonicalize", '{"z":2,"a":1}').stdout, '{"a":1,"z":2}\n');
  const result = cli("digest", JSON.stringify({ candidate: share(), consent: consent() }));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), computePreviewDigest(share(), consent()));
  assert.equal(cli("digest", JSON.stringify({ candidate: share(), consent: consent(), extra: true })).status, 1);
});
test("CLI failure exit codes and errors do not leak input", () => {
  const result = cli("share", '{"SYNTHETIC_PRIVATE_SENTINEL":');
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC_PRIVATE_SENTINEL/);
  assert.equal(cli("unknown", "{}").status, 2);
});
test("CLI rejects duplicate keys and invalid UTF8 instead of rewriting bytes", () => {
  assert.equal(cli("canonicalize", '{"a":1,"a":2}').status, 1);
  const malformed = spawnSync(process.execPath, ["packages/contracts/dist/cli.js", "canonicalize", "-"], {
    input: Buffer.from([0x22, 0xc3, 0x28, 0x22]),
    encoding: "utf8",
  });
  assert.equal(malformed.status, 1);
});
