import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { draft } from "./fixtures.js";

const packageDir = fileURLToPath(new URL("../", import.meta.url));
const rootDir = fileURLToPath(new URL("../../../", import.meta.url));
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

test("built CLI reads only explicit stdin, retains outcomes, and rejects duplicate JSON safely", () => {
  const valid = spawnSync(process.execPath, [cli, "measure", "-"], { input: JSON.stringify(draft()), encoding: "utf8" });
  assert.equal(valid.status, 0, valid.stderr);
  const result = JSON.parse(valid.stdout) as { valid: boolean; report: { pairs: unknown[]; execution_claim: string } };
  assert.equal(result.valid, true);
  assert.equal(result.report.pairs.length, 5);
  assert.equal(result.report.execution_claim, "invented_fixture");
  const invalid = spawnSync(process.execPath, [cli, "measure", "-"], {
    input: '{"invented_sensitive_key":"never echo","invented_sensitive_key":"duplicate"}', encoding: "utf8",
  });
  assert.equal(invalid.status, 1);
  assert.equal((invalid.stdout + invalid.stderr).includes("never echo"), false);
  assert.equal((invalid.stdout + invalid.stderr).includes("invented_sensitive_key"), false);
  assert.match(invalid.stderr, /invalid_cli_input/);
  const usage = spawnSync(process.execPath, [cli], { encoding: "utf8" });
  assert.equal(usage.status, 2);
});

test("offline packed consumer imports ESM/CJS, types and CLI without contracts installed", () => {
  const destination = mkdtempSync(join(tmpdir(), "better-loop-m4-consumer-"));
  const packed = JSON.parse(execFileSync("npm", [
    "pack", packageDir, "--json", "--ignore-scripts", "--pack-destination", destination,
  ], { encoding: "utf8" })) as { filename: string; files: { path: string }[] }[];
  const archive = packed[0]!;
  assert.ok(archive.files.some(file => file.path === "LICENSE"));
  assert.ok(archive.files.some(file => file.path === "THIRD_PARTY_NOTICES.md"));
  assert.ok(archive.files.every(file => /^(package\.json|README\.md|LICENSE|THIRD_PARTY_NOTICES\.md|dist\/.*)$/.test(file.path)));
  writeFileSync(join(destination, "package.json"), '{"name":"synthetic-measurement-consumer","private":true,"type":"module"}\n');
  execFileSync("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", join(destination, archive.filename)], {
    cwd: destination, stdio: "pipe",
  });
  const installed = JSON.parse(readFileSync(join(destination, "node_modules/@better-loop/measurement/package.json"), "utf8")) as { dependencies?: unknown };
  assert.equal(installed.dependencies, undefined);
  const esm = execFileSync(process.execPath, ["--input-type=module", "-e",
    'import {measurePair} from "@better-loop/measurement"; console.log(measurePair(100,125,"lower_is_better").relative_change_percent);',
  ], { cwd: destination, encoding: "utf8" });
  assert.equal(esm.trim(), "-25");
  const cjs = execFileSync(process.execPath, ["--input-type=commonjs", "-e",
    'const {gradeExpectations}=require("@better-loop/measurement"); console.log(gradeExpectations("{}",[{id:"x",kind:"json_equals",pointer:"",value:{}}]).all_passed);',
  ], { cwd: destination, encoding: "utf8" });
  assert.equal(cjs.trim(), "true");
  const types = [
    'import {measurePair, type EvaluationDraft, type MeasurementOptions} from "@better-loop/measurement";',
    'const metric: number | null = measurePair(1, 2, "lower_is_better").relative_change_percent;',
    'declare const draft: EvaluationDraft; declare const options: MeasurementOptions;',
    'const pairCount: number = draft.trials.length; const registered: string | undefined = options.registration?.digest;',
    'void metric; void pairCount; void registered;',
  ].join("\n");
  writeFileSync(join(destination, "consumer.mts"), types);
  writeFileSync(join(destination, "consumer.cts"), types);
  writeFileSync(join(destination, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, types: [] },
    files: ["consumer.mts", "consumer.cts"],
  }));
  execFileSync(process.execPath, [join(rootDir, "node_modules/typescript/bin/tsc"), "-p", join(destination, "tsconfig.json")], { stdio: "pipe" });
  const packedCli = join(destination, "node_modules/@better-loop/measurement/dist/cli.js");
  const measured = spawnSync(process.execPath, [packedCli, "measure", "-"], { input: JSON.stringify(draft()), encoding: "utf8" });
  assert.equal(measured.status, 0, measured.stderr);
  assert.equal((JSON.parse(measured.stdout) as { valid: boolean }).valid, true);
});
