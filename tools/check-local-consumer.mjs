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
  for (const name of ["contracts", "core", "adapters", "privacy", "measurement", "evidence", "discovery", "handoff", "journey", "cli"]) {
    const [packed] = JSON.parse(run("npm", ["pack", "--workspace", `@better-loop/${name}`, "--pack-destination", scratch, "--json"]));
    dependencies[packed.name] = `file:${join(scratch, packed.filename)}`;
    if (name !== "contracts") {
      for (const file of packed.files) {
        const declarationVendor = name === "discovery" && /^dist\/vendor\/(?:evidence|share-candidate)\.d\.ts$/.test(file.path);
        assert.ok(declarationVendor || /^(?:package\.json|README\.md|API\.md|LICENSE|THIRD_PARTY_NOTICES\.md|dist\/sender\.inline\.js|dist\/[a-zA-Z0-9_-]+\.(?:js|cjs|d\.ts|d\.cts))$/.test(file.path),
          `Unexpected local tooling artifact: ${file.path}`);
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
import { readFileSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createRequire } from "node:module";
import { assess, rewritePrompt } from "@better-loop/core";
import { normalizeSelectedExport } from "@better-loop/adapters";
import { capabilities, writeJourneyView, checkRelease, compareReleaseVersions } from "@better-loop/cli";
import { scanCandidate } from "@better-loop/privacy";
import { measurePair } from "@better-loop/measurement";
import { validateContribution } from "@better-loop/evidence";
import { summarizeLocalMilestones } from "@better-loop/discovery";
import { createScope, useJourney, reviewJourney, JOURNEY_VERSION } from "@better-loop/journey";
import { startHandoff, HANDOFF_PROTOCOL } from "@better-loop/handoff";
import { receiveHandoff } from "@better-loop/handoff/browser";
const input=readFileSync("selected.json","utf8");
const normalized=normalizeSelectedExport(input,"codex");
const report=assess(normalized);
assert.equal(report.observations.length,11);
assert.equal(report.metrics.quality,null);
assert.equal(rewritePrompt("Return JSON only.","general").status,"proposal_not_executed");
assert.equal(capabilities().capabilities.upload,false);
assert.equal((await checkRelease(capabilities().helper_version,{disabled:true})).state,"disabled");
assert.equal(compareReleaseVersions("0.4.0-draft.5","0.4.0"),-1);
assert.equal(scanCandidate(report).valid,false);
assert.equal(measurePair(200,150,"lower_is_better").relative_change_percent,25);
assert.equal(validateContribution(report).valid,false);
assert.equal(summarizeLocalMilestones([]).later_comparable_outcome,"not_established");
assert.equal(JOURNEY_VERSION,"0.2.0-draft.3");
assert.equal(typeof createScope,"function");
assert.equal(typeof startHandoff,"function");
assert.equal(typeof receiveHandoff,"function");
assert.equal(HANDOFF_PROTOCOL,"bl-handoff-0.1");
assert.ok(readFileSync(new URL("./node_modules/@better-loop/handoff/dist/sender.inline.js",import.meta.url),"utf8").length > 0);
const require=createRequire(import.meta.url);
assert.deepEqual(require("@better-loop/core").assess(normalized),report);
assert.deepEqual(require("@better-loop/adapters").normalizeSelectedExport(input,"codex"),normalized);
assert.deepEqual(require("@better-loop/cli").capabilities(),capabilities());
assert.equal((await require("@better-loop/cli").checkRelease(capabilities().helper_version,{disabled:true})).state,"disabled");
assert.equal(require("@better-loop/measurement").measurePair(200,150,"lower_is_better").relative_change_percent,25);
assert.deepEqual(require("@better-loop/evidence").validateContribution(report),validateContribution(report));
assert.deepEqual(require("@better-loop/discovery").summarizeLocalMilestones([]),summarizeLocalMilestones([]));
assert.equal(require("@better-loop/journey").JOURNEY_VERSION,JOURNEY_VERSION);
assert.equal(typeof require("@better-loop/handoff").startHandoff,"function");
assert.equal(typeof require("@better-loop/handoff/browser").receiveHandoff,"function");
const selectedRoot=join(realpathSync("."),"selected-repository");
mkdirSync(selectedRoot);
const git=(args)=>execFileSync("git",["-c","core.hooksPath=/dev/null","-C",selectedRoot,...args],{
  env:{PATH:process.env.PATH,GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:"/dev/null"},stdio:"pipe"});
git(["init","--quiet","--initial-branch=main","--template="]);
writeFileSync(join(selectedRoot,"selected.ts"),"export const fixture = 1;");
git(["add","--","selected.ts"]);
const stateDirectory=join(realpathSync("."),"chosen-journey-state");
await createScope({stateDirectory,roots:[selectedRoot],task:{family:"software",goal:"Package consumer fixture",acceptance_criteria:["Retain unknown outcomes."]}});
const first=await useJourney({stateDirectory,host:"codex",excerptBytes:2000,excerptFiles:1});
assert.equal(first.state,"baseline");
assert.equal(first.changes[0].excerpt_format,"unified_hunks");
const second=await require("@better-loop/journey").useJourney({stateDirectory,host:"claude_code"});
assert.equal(second.state,"unchanged");
assert.equal(second.checkpoint_id,first.checkpoint_id);
assert.equal(second.assessment_created,false);
const view=await writeJourneyView({stateDirectory,output:join(realpathSync("."),"chosen-view.html")});
assert.equal(view.state_changed,false);
assert.equal(view.browser_opened,false);
assert.ok(readFileSync(view.output,"utf8").startsWith("<!doctype html>"));
assert.equal((await reviewJourney(stateDirectory)).current.checkpoint_id,second.checkpoint_id);
assert.equal(typeof require("@better-loop/cli").writeJourneyView,"function");
assert.equal(typeof require("@better-loop/journey").reviewJourney,"function");
`;
  await writeFile(join(consumer, "smoke.mjs"), source);
  run(process.execPath, ["smoke.mjs"], consumer);
  const cli = join(consumer, "node_modules/@better-loop/cli/dist/cli.js");
  const capabilities = JSON.parse(run(process.execPath, [cli, "capabilities", "--json"], consumer));
  assert.equal(capabilities.protocol, "bl-capabilities-0.2");
  assert.equal(capabilities.helper_version, "0.4.0-draft.5");
  for (const args of [["journey", "--help"], ["journey", "view", "--help"], ["draft-share", "--help"], ["release-check", "--help"]]) {
    assert.match(run(process.execPath, [cli, ...args], consumer), /Better Loop/);
  }
  for (const flag of ["--offline", "--disabled"]) {
    const result = JSON.parse(run(process.execPath, [cli, "release-check", flag, "--cache-dir", join(consumer, "unused-cache"), "--json"], consumer));
    assert.equal(result.state, "disabled");
    assert.equal(result.observation_source, "none");
  }
  const detector = join(root, "skills/better-loop/scripts/detect-helper.mjs");
  assert.equal(JSON.parse(run(process.execPath, [detector, cli], consumer)).state, "available");
  for (const name of ["core", "adapters", "measurement", "handoff"]) {
    const path = join(consumer, "node_modules/@better-loop", name, "package.json");
    const original = await readFile(path, "utf8");
    await writeFile(path, JSON.stringify({ ...JSON.parse(original), version: "99.0.0" }));
    try {
      assert.throws(() => run(process.execPath, [detector, cli], consumer), error => {
        assert.equal(JSON.parse(error.stdout.toString()).state, "incompatible");
        return true;
      });
    } finally { await writeFile(path, original); }
  }
  const report = JSON.parse(run(process.execPath, [cli, "assess", "--host", "claude_code", "--input", "selected.json", "--format", "json"], consumer));
  assert.equal(report.observations.length, 11);
  const types = `import {assess, type PrivateReport, type TaskFamily} from "@better-loop/core";
import {normalizeSelectedExport} from "@better-loop/adapters";
import {capabilities, checkRelease, compareReleaseVersions, type ReleaseCheckResult} from "@better-loop/cli";
import {type HostAssessmentInput, createScope} from "@better-loop/journey";
import {type ContributionApproval, validateContribution} from "@better-loop/evidence";
import {summarizeLocalMilestones} from "@better-loop/discovery";
import {startHandoff} from "@better-loop/handoff";
import {receiveHandoff} from "@better-loop/handoff/browser";
const family:TaskFamily="analysis_finance";
const report:PrivateReport=assess(normalizeSelectedExport("{}", "codex", {task:{family,goal:"synthetic",acceptance_criteria:[]}}));
const unknown:number|null=report.metrics.quality;
const rating:null=report.observations[0]!.rating;
capabilities(); void unknown; void rating;
const release:Promise<ReleaseCheckResult>=checkRelease("0.4.0-draft.5",{disabled:true});
void release; compareReleaseVersions("1.0.0-rc.2","1.0.0");
const host:HostAssessmentInput={summary:"Fixture",diagnosis:"Fixture",next_action:"Fixture",acceptance_check:"Fixture",limitations:[]};
const local:ReturnType<typeof createScope>|null=null; void local; void host;
const approval:ContributionApproval|null=null; void approval;
void startHandoff; void receiveHandoff; validateContribution({}); summarizeLocalMilestones([]);
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
  console.log(`PASS: ten reviewed archives installed with offline npm ci; ESM/CJS, both declaration modes, CLI assessment, measurement, journey, evidence, discovery and both handoff entrypoints/assets.`);
  console.log(JSON.stringify(artifacts));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
