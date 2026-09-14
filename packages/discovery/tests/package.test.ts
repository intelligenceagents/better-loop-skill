import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { attestedRow, criteria, current, row } from "./fixtures.js";

test("offline packed package has bundled runtime/types, ESM/CJS consumers, MIT/notices and no fixture artifacts", () => {
  const pkg = fileURLToPath(new URL("../", import.meta.url));
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const destination = mkdtempSync(join(tmpdir(), "better-loop-discovery-consumer-"));
  const [packed] = JSON.parse(execFileSync("npm", ["pack", pkg, "--json", "--ignore-scripts", "--pack-destination", destination], { encoding: "utf8" })) as Array<{
    filename: string; files: { path: string }[];
  }>;
  assert.ok(packed);
  assert.ok(packed.files.some(file => file.path === "LICENSE"));
  assert.ok(packed.files.some(file => file.path === "THIRD_PARTY_NOTICES.md"));
  assert.ok(packed.files.every(file => /^(dist\/.*|package\.json|README\.md|API\.md|LICENSE|THIRD_PARTY_NOTICES\.md)$/.test(file.path)));
  writeFileSync(join(destination, "package.json"), '{"name":"test-only-discovery-consumer","private":true,"type":"module"}\n');
  execFileSync("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", join(destination, packed.filename)], { cwd: destination, stdio: "pipe" });
  const installed = JSON.parse(readFileSync(join(destination, "node_modules/@better-loop/discovery/package.json"), "utf8")) as { dependencies?: unknown; version: string };
  assert.equal(installed.dependencies, undefined);
  assert.equal(installed.version, "0.1.0-draft.2");
  const unsupported = row(); unsupported.capability_evidence!.human_actions = [];
  const input = JSON.stringify({ criteria: criteria(), current, attested: attestedRow(), unsupported });
  for (const [mode, statement] of [
    ["module", 'import { DISCOVERY_VERSION, judgeApprovalBindingOutput, matchRoleEvidence, MINIMUM_COHORT_OWNERS } from "@better-loop/discovery";'],
    ["commonjs", 'const { DISCOVERY_VERSION, judgeApprovalBindingOutput, matchRoleEvidence, MINIMUM_COHORT_OWNERS } = require("@better-loop/discovery");'],
  ]) {
    const output = execFileSync(process.execPath, [`--input-type=${mode}`, "-e",
      `${statement}
const input = ${input};
console.log(DISCOVERY_VERSION, MINIMUM_COHORT_OWNERS, judgeApprovalBindingOutput(null).result,
  matchRoleEvidence(input.criteria, [input.attested], input.current).state,
  matchRoleEvidence(input.criteria, [input.unsupported], input.current).state);`], { cwd: destination, encoding: "utf8" });
    assert.equal(output.trim(), "0.1.0-draft.2 20 incomplete available invalid_input");
  }
  const types = `
import {
  matchRoleEvidence, aggregateBenchmarkCohort, summarizeLocalMilestones, judgeApprovalBindingOutput,
  type RoleCriteria, type PublicEvidenceRecord, type CapabilityEvidence, type ContributionConsent,
  type BenchmarkCohortQuery, type BenchmarkCohortRecord, type LocalMilestoneEvent
} from "@better-loop/discovery";
declare const criteria: RoleCriteria; declare const rows: PublicEvidenceRecord[];
declare const capsule: CapabilityEvidence; declare const consent: ContributionConsent;
declare const query: BenchmarkCohortQuery; declare const cohortRows: BenchmarkCohortRecord[];
declare const events: LocalMilestoneEvent[];
const state: string = matchRoleEvidence(criteria, rows, {source:"current_server_snapshot", complete:true}).state;
const index: number | undefined = aggregateBenchmarkCohort(query, cohortRows, {source:"current_server_snapshot", complete:true}).statistics?.mean_candidate_index;
const capVersion: "bl-capability-evidence-0.1" = capsule.schema_version;
const policy: "bl-sharing-0.2" = consent.policy_version;
void summarizeLocalMilestones(events); void judgeApprovalBindingOutput(null); void state; void index; void capVersion; void policy;
// @ts-expect-error no arbitrary employer criterion
const wrong: RoleCriteria = {employer: "test"};
`;
  writeFileSync(join(destination, "consumer.mts"), types);
  writeFileSync(join(destination, "consumer.cts"), types);
  writeFileSync(join(destination, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, types: [] },
    files: ["consumer.mts", "consumer.cts"],
  }));
  execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", join(destination, "tsconfig.json")], { stdio: "pipe" });
});
