import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), "better-loop-local-consumer-"));
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
try {
  const consumer = join(scratch, "consumer");
  await mkdir(consumer);
  const dependencies = {};
  const artifacts = [];
  for (const name of ["contracts", "core", "adapters", "privacy", "measurement", "cli"]) {
    const [packed] = JSON.parse(run("npm", ["pack", "--workspace", `@better-loop/${name}`, "--pack-destination", scratch, "--json"]));
    dependencies[packed.name] = `file:${join(scratch, packed.filename)}`;
    if (name !== "contracts") {
      for (const file of packed.files) {
        assert.match(file.path, /^(?:package\.json|README\.md|LICENSE|THIRD_PARTY_NOTICES\.md|dist\/[a-zA-Z0-9_-]+\.(?:js|cjs|d\.ts|d\.cts))$/, `Unexpected local tooling artifact: ${file.path}`);
        const contents = await readFile(join(root, "packages", name, file.path), "utf8");
        assert.doesNotMatch(contents, /\/Users\/I\d+|sourceMappingURL|credential\.md|SYNTHETIC_PRIVATE_SENTINEL/);
      }
    }
    artifacts.push({ name: packed.name, files: packed.files.length, integrity: packed.integrity });
  }
  await writeFile(join(consumer, "package.json"), JSON.stringify({ name: "synthetic-offline-consumer", private: true, type: "module", dependencies }, null, 2));
  run("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"], consumer);
  run("npm", ["ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"], consumer);
  await writeFile(join(consumer, "selected.json"), await readFile(join(root, "evals/m2/selected-example.json")));
  const source = `
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { assess, rewritePrompt } from "@better-loop/core";
import { normalizeSelectedExport } from "@better-loop/adapters";
import { capabilities } from "@better-loop/cli";
import { scanCandidate } from "@better-loop/privacy";
import { measurePair } from "@better-loop/measurement";
const input=readFileSync("selected.json","utf8");
const normalized=normalizeSelectedExport(input,"codex");
const report=assess(normalized);
assert.equal(report.observations.length,11);
assert.equal(report.metrics.quality,null);
assert.equal(rewritePrompt("Return JSON only.","general").status,"proposal_not_executed");
assert.equal(capabilities().capabilities.upload,false);
assert.equal(scanCandidate(report).valid,false);
assert.equal(measurePair(200,150,"lower_is_better").relative_change_percent,25);
const require=createRequire(import.meta.url);
assert.deepEqual(require("@better-loop/core").assess(normalized),report);
assert.deepEqual(require("@better-loop/adapters").normalizeSelectedExport(input,"codex"),normalized);
assert.deepEqual(require("@better-loop/cli").capabilities(),capabilities());
assert.equal(require("@better-loop/measurement").measurePair(200,150,"lower_is_better").relative_change_percent,25);
`;
  await writeFile(join(consumer, "smoke.mjs"), source);
  run(process.execPath, ["smoke.mjs"], consumer);
  const cli = join(consumer, "node_modules/@better-loop/cli/dist/cli.js");
  const capabilities = JSON.parse(run(process.execPath, [cli, "capabilities", "--json"], consumer));
  assert.equal(capabilities.protocol, "bl-capabilities-0.2");
  const report = JSON.parse(run(process.execPath, [cli, "assess", "--host", "claude_code", "--input", "selected.json", "--format", "json"], consumer));
  assert.equal(report.observations.length, 11);
  const types = `import {assess, type PrivateReport, type TaskFamily} from "@better-loop/core";
import {normalizeSelectedExport} from "@better-loop/adapters";
import {capabilities} from "@better-loop/cli";
const family:TaskFamily="analysis_finance";
const report:PrivateReport=assess(normalizeSelectedExport("{}", "codex", {task:{family,goal:"synthetic",acceptance_criteria:[]}}));
const unknown:number|null=report.metrics.quality;
const rating:null=report.observations[0]!.rating;
capabilities(); void unknown; void rating;
// @ts-expect-error no unsupported family
const invalid:TaskFamily="employer"; void invalid;
`;
  await writeFile(join(consumer, "types.mts"), types);
  await writeFile(join(consumer, "types.cts"), types);
  await writeFile(join(consumer, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, types: [] },
    include: ["types.mts", "types.cts"],
  }));
  run(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer);
  console.log(`PASS: six reviewed archives installed with offline npm ci; local ESM/CJS, declarations in both modes, CLI assessment, measurement and capabilities.`);
  console.log(JSON.stringify(artifacts));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
