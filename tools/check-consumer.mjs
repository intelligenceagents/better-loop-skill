import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

await mkdir("artifacts", { recursive: true });
const root = process.cwd();
const packed = JSON.parse(execFileSync("npm", ["pack", "--workspace", "@better-loop/contracts", "--pack-destination", "artifacts", "--json"], { encoding: "utf8" }))[0];
const directory = await mkdtemp(resolve("artifacts", "consumer-"));
const archive = resolve("artifacts", packed.filename);
await writeFile(resolve(directory, "package.json"), JSON.stringify({ name: "synthetic-contract-consumer", private: true, type: "module" }));
// No install scripts or network access are needed by the archived package.
execFileSync("npm", ["install", "--offline", "--ignore-scripts", "--save-exact", "--no-audit", "--no-fund", archive], { cwd: directory, stdio: "pipe" });
execFileSync("npm", ["ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: directory, stdio: "pipe" });
const esm = `
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { canonicalize, computePreviewDigest, validateShareCandidate, validateEvaluationRun, SCHEMA_VERSION } from "@better-loop/contracts";
const require = createRequire(import.meta.url);
const candidate = require(${JSON.stringify(resolve("examples/software-story.synthetic.json"))});
const local = require(${JSON.stringify(resolve("examples/evaluation-run.synthetic.json"))});
assert.equal(validateShareCandidate(candidate).valid, true);
assert.equal(validateEvaluationRun(local).valid, true);
assert.equal(SCHEMA_VERSION, "0.1.0");
assert.equal(canonicalize({z:1,a:2}), '{"a":2,"z":1}');
assert.match(computePreviewDigest(candidate, {public_story:true,benchmark_aggregation:false,community_learning:false,policy_version:"bl-sharing-0.1"}), /^[0-9a-f]{64}$/);
assert.equal(require("@better-loop/contracts/schemas/share-candidate.schema.json").properties.schema_version.const, "0.1.0");
`;
await writeFile(resolve(directory, "check.mjs"), esm);
await writeFile(resolve(directory, "check.cjs"), `
const assert = require("node:assert/strict");
const api = require("@better-loop/contracts");
assert.equal(api.canonicalize({z:1,a:2}), '{"a":2,"z":1}');
assert.equal(api.CONTRACT_PACKAGE_VERSION, "0.1.0-draft.1");
`);
for (const file of ["check.mjs", "check.cjs"]) execFileSync(process.execPath, [file], { cwd: directory, stdio: "pipe" });
const typeSource = `
import { validateShareCandidate, computePreviewDigest, type PreviewConsent } from "@better-loop/contracts";
const checked = validateShareCandidate({});
const consent: PreviewConsent = {public_story:true,benchmark_aggregation:false,community_learning:false,policy_version:"bl-sharing-0.1"};
if (checked.valid) {
  const version: "0.1.0" = checked.data.schema_version;
  const digest: string = computePreviewDigest(checked.data, consent);
  void version; void digest;
}
// @ts-expect-error Unrecognized policy cannot inhabit PreviewConsent.
const invalid: PreviewConsent = {...consent, policy_version:"unknown"};
void invalid;
`;
await writeFile(resolve(directory, "types.mts"), typeSource);
await writeFile(resolve(directory, "types.cts"), typeSource);
await writeFile(resolve(directory, "tsconfig.json"), JSON.stringify({
  compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, types: [] },
  files: ["types.mts", "types.cts"],
}));
execFileSync(resolve(root, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], { cwd: directory, stdio: "pipe" });
const output = execFileSync(process.execPath, ["node_modules/@better-loop/contracts/dist/cli.js", "share", resolve(root, "examples/software-story.synthetic.json")], { cwd: directory, encoding: "utf8" });
assert.deepEqual(JSON.parse(output), { valid: true, errors: [] });
console.log("PASS: offline archive install/npm ci; ESM, CommonJS, schema subpath, CLI and TypeScript import/require declarations.");
