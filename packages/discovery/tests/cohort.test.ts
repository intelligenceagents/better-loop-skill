import assert from "node:assert/strict";
import test from "node:test";
import { aggregateBenchmarkCohort } from "../dist/index.js";
import { cohort, cohortQuery, cohortRow, current } from "./fixtures.js";
import type { BenchmarkCohortRecord } from "../src/types.js";

test("fixed threshold is 20 distinct owners; suppressed outputs reveal no counts or owner identifiers", () => {
  const suppressed = aggregateBenchmarkCohort(cohortQuery(), cohort(19), current);
  assert.equal(suppressed.state, "suppressed");
  assert.equal(suppressed.statistics, null);
  assert.equal(suppressed.minimum_distinct_owners, 20);
  assert.equal(JSON.stringify(suppressed).includes("TEST_ONLY_OWNER"), false);
  const available = aggregateBenchmarkCohort(cohortQuery(), cohort(20), current);
  assert.equal(available.state, "available");
  assert.equal(available.statistics!.distinct_owners_rounded_down_to_5, 20);
  assert.equal(available.cohort!.benchmark_version, "0.1");
  assert.equal("server_owner_id" in available, false);
});
test("neutral/negative indices affect rounded mean and median; they are not filtered as losses", () => {
  // Ten neutral + ten adverse indices: unrounded mean and median are both 112.5.
  const rows = Array.from({ length: 20 }, (_, i) => cohortRow(i + 1, i < 10 ? 100 : 125));
  const result = aggregateBenchmarkCohort(cohortQuery(), rows, current);
  assert.equal(result.statistics!.mean_candidate_index, 115);
  assert.equal(result.statistics!.median_candidate_index, 115);
  assert.equal(result.statistics!.baseline_index, 100);
});
test("equal owner weight includes all outcomes, does not select the best record, and deduplicates public rows", () => {
  const rows = cohort();
  rows[0] = cohortRow(1, 200);
  const additional = cohortRow(21, 300); additional.server_owner_id = rows[0]!.server_owner_id;
  // Owner one's mean=250. Nineteen other owners=100. Overall 107.5 -> 110.
  const result = aggregateBenchmarkCohort(cohortQuery(), [...rows, additional, additional], current);
  assert.equal(result.statistics!.mean_candidate_index, 110);
  assert.equal(result.statistics!.median_candidate_index, 100);
  assert.equal(result.statistics!.distinct_owners_rounded_down_to_5, 20);
  const oneOwner = cohort(25).map(row => ({ ...row, server_owner_id: "TEST_ONLY_SINGLE_OWNER" }));
  assert.equal(aggregateBenchmarkCohort(cohortQuery(), oneOwner, current).state, "suppressed");
});
test("owner count rounds down and operational identifiers never appear in available output", () => {
  const result = aggregateBenchmarkCohort(cohortQuery(), cohort(24), current);
  assert.equal(result.statistics!.distinct_owners_rounded_down_to_5, 20);
  assert.equal(JSON.stringify(result).includes("TEST_ONLY_OWNER"), false);
  assert.equal(JSON.stringify(result).includes("00000000-0000"), false);
  assert.equal("percentile" in result.statistics!, false);
});
const exclusions: Array<[string, (row: BenchmarkCohortRecord) => void]> = [
  ["benchmark optout", row => { row.consent!.benchmark_aggregation = false; }],
  ["withdrawal", row => { row.status = "withdrawn"; }],
  ["deletion", row => { row.status = "deleted"; }],
  ["noncurrent", row => { row.current = false; }],
  ["synthetic", row => { row.candidate.content_origin = "synthetic"; row.capability_evidence!.benchmark = null; }],
  ["no capsule", row => { row.capability_evidence = null; }],
  ["no benchmark", row => { row.capability_evidence!.benchmark = null; }],
  ["incomplete benchmark", row => { row.capability_evidence!.benchmark!.result = "incomplete"; }],
  ["failed benchmark quality", row => { row.capability_evidence!.benchmark!.result = "not_met"; }],
  ["unknown floor", row => { row.candidate.evidence.quality_floor = "unknown"; }],
  ["critical regression", row => { row.candidate.evidence.critical_regression = "observed"; }],
  ["unknown regression", row => { row.candidate.evidence.critical_regression = "unknown"; }],
  ["unknown check", row => { row.capability_evidence!.quality_checks[0]!.result = "unknown"; }],
  ["missing checks", row => { row.capability_evidence!.quality_checks = []; }],
  ["unrelated quality only", row => { row.capability_evidence!.quality_checks[0]!.dimension = "communication"; }],
  ["incompatible", row => {
    row.candidate.evidence.compatibility = "not_comparable"; row.candidate.kpis = []; row.candidate.outcome = "insufficient_evidence";
  }],
  ["missing metric", row => { row.candidate.kpis = []; }],
  ["different task", row => { row.candidate.task.task_family = "general"; }],
  ["different difficulty", row => { row.candidate.task.difficulty = "complex"; }],
  ["different condition", row => { row.candidate.conditions.candidate.platform = "codex"; }],
  ["different comparison", row => { row.candidate.evidence.comparison = "observational_followup"; }],
  ["different trust", row => { row.server_trust_tier = "locally_recorded"; }],
  ["different benchmark basis", row => { row.capability_evidence!.benchmark!.basis = "locally_recorded"; }],
  ["different metric provenance", row => { row.candidate.kpis[0]!.provenance = "estimated"; }],
  ["revision only", row => { row.capability_evidence!.change = "revision_only"; }],
];
for (const [name, change] of exclusions) test(`${name} removes eligibility and cannot leave stale aggregation`, () => {
  const rows = cohort();
  assert.equal(aggregateBenchmarkCohort(cohortQuery(), rows, current).state, "available");
  change(rows[0]!);
  assert.equal(aggregateBenchmarkCohort(cohortQuery(), rows, current).state, "suppressed");
});
test("discovery and community consent are not required for separately consented benchmark aggregation", () => {
  const rows = cohort().map(row => {
    row.consent!.candidate_discovery = false; row.consent!.community_learning = false; return row;
  });
  assert.equal(aggregateBenchmarkCohort(cohortQuery(), rows, current).state, "available");
});
test("exact unknown/version/metric rejection and no caller-supplied lowered threshold", () => {
  for (const query of [
    { ...cohortQuery(), minimum_distinct_owners: 1 },
    { ...cohortQuery(), benchmark_version: "future" },
    { ...cohortQuery(), framework_version: "future" },
    { ...cohortQuery(), rubric_id: "future" },
    { ...cohortQuery(), metric_definition_version: "future" },
    { ...cohortQuery(), benchmark_conditions_version: "future" },
    { ...cohortQuery(), metric: "revenue" },
    { ...cohortQuery(), direction: "higher_is_better" },
  ]) assert.equal(aggregateBenchmarkCohort(query as never, cohort(), current).state, "invalid_input");
  const wrongTask = cohortQuery(); wrongTask.task.task_family = "general";
  assert.equal(aggregateBenchmarkCohort(wrongTask, cohort(), current).state, "invalid_input");
});
test("unknown fields/raw metrics, unavailable snapshot and input bounds do not produce statistics", () => {
  const rows = cohort();
  const contaminated = { ...rows[0]!, raw_business_metric: 12345 };
  assert.equal(aggregateBenchmarkCohort(cohortQuery(), [contaminated, ...rows.slice(1)], current).state, "invalid_input");
  assert.equal(aggregateBenchmarkCohort(cohortQuery(), rows, { source: "offline_snapshot", complete: true }).state, "current_snapshot_required");
  assert.equal(aggregateBenchmarkCohort(cohortQuery(), rows, { ...current, complete: false }).state, "current_snapshot_required");
  assert.equal(aggregateBenchmarkCohort(cohortQuery(), cohort(1001), current).state, "invalid_input");
  const inconsistent = cohort(); inconsistent[0]!.candidate.evidence.compatibility = "not_comparable";
  assert.equal(aggregateBenchmarkCohort(cohortQuery(), inconsistent, current).state, "invalid_input");
});
