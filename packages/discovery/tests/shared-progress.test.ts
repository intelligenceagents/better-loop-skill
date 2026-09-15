import assert from "node:assert/strict";
import test from "node:test";
import { aggregateSharedProgress, findRelatedLessons, listSharedChallenges } from "../dist/index.js";
import type { SharedProgressResult, SharedSignalRecord } from "../src/signals.js";
import { current } from "./fixtures.js";
import { families, learningQuery, problems, publicSharedRow, sharedQuery, sharedRow, sharedRows } from "./shared-fixtures.js";

function noStatistics(result: SharedProgressResult) {
  assert.equal(result.cohort, null);
  assert.equal(result.statistics, null);
  assert.deepEqual(Object.keys(result).sort(), [
    "claim", "cohort", "limitations", "minimum_distinct_owners", "state", "statistics", "version",
  ]);
  assert.equal(result.minimum_distinct_owners, 20);
}

test("19 owners are suppressed without hints and 20 release only rounded descriptive indices", () => {
  const small = aggregateSharedProgress(sharedQuery(), sharedRows(19), current);
  assert.equal(small.state, "suppressed"); noStatistics(small);
  assert.deepEqual(small, aggregateSharedProgress(sharedQuery(), [], current));
  const available = aggregateSharedProgress(sharedQuery(), sharedRows(), current);
  assert.equal(available.version, "bl-shared-progress-0.1");
  assert.equal(available.state, "available");
  assert.equal(available.claim, "uncalibrated_descriptive_reported_progress");
  assert.deepEqual(available.statistics, {
    distinct_owners_rounded_down_to_5: 20, baseline_index: 100, mean_candidate_index: 100, median_candidate_index: 100,
    rounding: "nearest_5_index_points", aggregation: "equal_owner_weight_mean_of_current_eligible_records",
    metric: "model_tokens", direction: "lower_is_better", quality_floor: "met", critical_regression: "none_observed",
    coverage: "not_aggregated",
  });
  assert.equal(aggregateSharedProgress(sharedQuery(), sharedRows(24), current).statistics!.distinct_owners_rounded_down_to_5, 20);
  assert.equal(aggregateSharedProgress(sharedQuery(), sharedRows(25), current).statistics!.distinct_owners_rounded_down_to_5, 25);
});

test("general descriptive queries span seven families and eight problems without registering a benchmark", () => {
  for (const family of families) {
    for (const problem of problems) {
      const query = sharedQuery(family); query.task.problem_type = problem;
      const rows = sharedRows().map(row => {
        row.candidate.task.task_family = family; row.candidate.task.problem_type = problem; return row;
      });
      const result = aggregateSharedProgress(query, rows, current);
      assert.equal(result.state, "available", `${family}/${problem}`);
      assert.ok(rows.every(row => row.capability_evidence!.benchmark === null));
      assert.equal("benchmark_id" in result.cohort!, false);
    }
  }
});

test("neutral and unfavorable indices survive; equal owner weighting retains every eligible measurement", () => {
  const neutralAdverse = sharedRows().map((_, i) => sharedRow(i + 1, i < 10 ? 100 : 125));
  const result = aggregateSharedProgress(sharedQuery(), neutralAdverse, current);
  assert.equal(result.statistics!.mean_candidate_index, 115);
  assert.equal(result.statistics!.median_candidate_index, 115);
  const rows = sharedRows();
  rows[0] = sharedRow(1, 200);
  const extra = sharedRow(21, 300); extra.server_owner_id = rows[0]!.server_owner_id;
  const weighted = aggregateSharedProgress(sharedQuery(), [...rows, extra, extra], current);
  assert.equal(weighted.statistics!.mean_candidate_index, 110);
  assert.equal(weighted.statistics!.median_candidate_index, 100);
  assert.equal(weighted.statistics!.distinct_owners_rounded_down_to_5, 20);
  assert.deepEqual(weighted, aggregateSharedProgress(sharedQuery(), [extra, ...[...rows].reverse()], current));
});

test("duplicate public IDs and many records from one owner cannot reach the threshold", () => {
  const rows = sharedRows(19);
  const duplicate = structuredClone(rows[0]!);
  assert.equal(aggregateSharedProgress(sharedQuery(), [...rows, duplicate], current).state, "suppressed");
  const oneOwner = sharedRows(25).map(row => ({ ...row, server_owner_id: "TEST_ONLY_SINGLE_OWNER" }));
  assert.equal(aggregateSharedProgress(sharedQuery(), oneOwner, current).state, "suppressed");
  const newRecordSameOwner = sharedRow(20); newRecordSameOwner.server_owner_id = rows[0]!.server_owner_id;
  assert.equal(aggregateSharedProgress(sharedQuery(), [...rows, newRecordSameOwner], current).state, "suppressed");
});

const exclusions: Array<[string, (record: SharedSignalRecord) => void]> = [
  ["benchmark purpose revoked", row => { row.consent!.benchmark_aggregation = false; }],
  ["withdrawal", row => { row.status = "withdrawn"; }],
  ["deletion", row => { row.status = "deleted"; }],
  ["held", row => { row.status = "held"; }],
  ["historical", row => { row.current = false; }],
  ["legacy consent", row => { row.consent = null; }],
  ["missing capsule", row => { row.capability_evidence = null; }],
  ["synthetic", row => { row.candidate.content_origin = "synthetic"; }],
  ["revision-only", row => { row.capability_evidence!.change = "revision_only"; }],
  ["unknown change", row => { row.capability_evidence!.change = "unknown"; }],
  ["different family", row => { row.candidate.task.task_family = "general"; }],
  ["different problem", row => { row.candidate.task.problem_type = "reconciling_data"; }],
  ["different objective", row => { row.candidate.task.objective = "less_rework"; }],
  ["different difficulty", row => { row.candidate.task.difficulty = "complex"; }],
  ["unknown difficulty", row => { row.candidate.task.difficulty = "unknown"; }],
  ["different difficulty basis", row => { row.candidate.task.difficulty_basis = "self_estimated"; }],
  ["unknown difficulty basis", row => { row.candidate.task.difficulty_basis = "unknown"; }],
  ["different constraint set", row => { row.candidate.task.constraints.push("time_bounded"); }],
  ["different baseline platform", row => { row.candidate.conditions.baseline.platform = "codex"; }],
  ["different candidate model tier", row => { row.candidate.conditions.candidate.model_tier = "economy"; }],
  ["unknown condition", row => { row.candidate.conditions.candidate.platform = "unknown"; }],
  ["different track", row => { row.candidate.evidence.comparison = "observational_followup"; }],
  ["unknown compatibility", row => {
    row.candidate.evidence.compatibility = "unknown"; row.candidate.kpis = []; row.candidate.outcome = "insufficient_evidence";
  }],
  ["unknown floor", row => { row.candidate.evidence.quality_floor = "unknown"; }],
  ["failed floor", row => { row.candidate.evidence.quality_floor = "not_met"; }],
  ["critical regression", row => { row.candidate.evidence.critical_regression = "observed"; }],
  ["unknown critical regression", row => { row.candidate.evidence.critical_regression = "unknown"; }],
  ["missing required check", row => { row.capability_evidence!.quality_checks = []; }],
  ["different quality dimension", row => { row.capability_evidence!.quality_checks[0]!.dimension = "verification"; }],
  ["failed required check", row => { row.capability_evidence!.quality_checks[0]!.result = "not_met"; }],
  ["unknown required check", row => { row.capability_evidence!.quality_checks[0]!.result = "unknown"; }],
  ["different evaluator", row => { row.capability_evidence!.quality_checks[0]!.evaluator = "human"; }],
  ["different quality basis", row => { row.capability_evidence!.quality_checks[0]!.basis = "self_reported"; }],
  ["different trust tier", row => { row.server_trust_tier = "locally_recorded"; }],
  ["missing metric", row => { row.candidate.kpis = []; }],
  ["different metric", row => { row.candidate.kpis[0]!.metric = "model_duration"; }],
  ["different metric provenance", row => { row.candidate.kpis[0]!.provenance = "locally_captured"; }],
];
for (const [name, change] of exclusions) test(`${name} reduces 20 to 19 only after all eligibility filters`, () => {
  const rows = sharedRows();
  assert.equal(aggregateSharedProgress(sharedQuery(), rows, current).state, "available");
  change(rows[0]!);
  const result = aggregateSharedProgress(sharedQuery(), rows, current);
  assert.equal(result.state, "suppressed"); noStatistics(result);
});

test("purpose independence does not infer learning/discovery from participation in an aggregate", () => {
  const rows = sharedRows().map(row => {
    row.consent!.community_learning = false; row.consent!.candidate_discovery = false; return row;
  });
  assert.equal(aggregateSharedProgress(sharedQuery(), rows, current).state, "available");
  rows[0]!.consent!.benchmark_aggregation = false;
  rows[0]!.consent!.community_learning = true;
  rows[0]!.consent!.candidate_discovery = true;
  assert.equal(aggregateSharedProgress(sharedQuery(), rows, current).state, "suppressed");
});

test("multiple required quality dimensions must all match their prespecified evaluator and basis", () => {
  const query = sharedQuery();
  query.required_quality_dimensions = ["verification", "correctness"];
  const rows = sharedRows();
  assert.equal(aggregateSharedProgress(query, rows, current).state, "suppressed");
  for (const row of rows) row.capability_evidence!.quality_checks.push({
    dimension: "verification", result: "met", evaluator: "tool", basis: "locally_recorded",
  });
  assert.equal(aggregateSharedProgress(query, rows, current).state, "available");
  rows[0]!.capability_evidence!.quality_checks[1]!.evaluator = "agent";
  assert.equal(aggregateSharedProgress(query, rows, current).state, "suppressed");
  rows[0]!.capability_evidence!.quality_checks[1]!.evaluator = "tool";
  rows[0]!.capability_evidence!.quality_checks[1]!.basis = "self_reported";
  assert.equal(aggregateSharedProgress(query, rows, current).state, "suppressed");
});

test("a correctness objective requires correctness, while other objectives can use their own appropriate quality floor", () => {
  const query = sharedQuery(); query.required_quality_dimensions = ["verification"];
  const rows = sharedRows().map(row => {
    row.capability_evidence!.quality_checks = [{ dimension: "verification", result: "met", evaluator: "tool", basis: "locally_recorded" }];
    return row;
  });
  const result = aggregateSharedProgress(query, rows, current);
  assert.equal(result.state, "invalid_input"); noStatistics(result);
  query.task.objective = "clearer_communication"; query.required_quality_dimensions = ["communication"];
  for (const row of rows) {
    row.candidate.task.objective = "clearer_communication";
    row.capability_evidence!.quality_checks[0]!.dimension = "communication";
  }
  assert.equal(aggregateSharedProgress(query, rows, current).state, "available");
});

test("known alternative provenance/evaluator/trust conditions work when the entire stratum matches", () => {
  const query = sharedQuery();
  query.quality_evaluator = "human"; query.quality_basis = "self_reported";
  query.server_trust_tier = "locally_recorded"; query.metric_provenance = "locally_captured";
  query.comparison = "observational_followup";
  const rows = sharedRows().map(row => {
    row.server_trust_tier = query.server_trust_tier;
    row.candidate.kpis[0]!.provenance = query.metric_provenance;
    row.candidate.evidence.comparison = query.comparison;
    row.capability_evidence!.quality_checks[0]!.evaluator = query.quality_evaluator;
    row.capability_evidence!.quality_checks[0]!.basis = query.quality_basis;
    return row;
  });
  assert.equal(aggregateSharedProgress(query, rows, current).state, "available");
  assert.equal(aggregateSharedProgress(sharedQuery(), rows, current).state, "suppressed");
});

test("autonomous measurements establish no human action or ability; unknown coverage is not invented", () => {
  const rows = sharedRows().map(row => {
    row.capability_evidence!.human_involvement = "agent_autonomous";
    row.capability_evidence!.assessment_basis = "artifacts_only";
    row.capability_evidence!.human_actions = [];
    row.candidate.human_behaviors = [];
    row.candidate.evidence.coverage = "unknown";
    return row;
  });
  const result = aggregateSharedProgress(sharedQuery(), rows, current);
  assert.equal(result.state, "available");
  assert.equal(result.statistics!.coverage, "not_aggregated");
  for (const forbidden of ["human_actions", "human_involvement", "ability_score", "rank", "benchmark_id", "badge"]) {
    assert.equal(JSON.stringify(result).includes(`"${forbidden}"`), false, forbidden);
  }
});

test("normalization does not turn zero or high indices into missing data or best-result selection", () => {
  const rows = sharedRows().map((_, i) => sharedRow(i + 1, i < 10 ? 0 : 1000));
  const result = aggregateSharedProgress(sharedQuery(), rows, current);
  assert.equal(result.statistics!.mean_candidate_index, 500);
  assert.equal(result.statistics!.median_candidate_index, 500);
  for (const metric of ["model_duration", "human_effort", "rework_cycles", "quality_rubric", "estimated_api_cost"] as const) {
    const query = sharedQuery(); query.metric = metric;
    query.direction = metric === "quality_rubric" ? "higher_is_better" : "lower_is_better";
    if (metric === "estimated_api_cost") query.metric_provenance = "estimated";
    const neutral = sharedRows().map(row => {
      Object.assign(row.candidate.kpis[0]!, { metric, direction: query.direction, provenance: query.metric_provenance });
      return row;
    });
    assert.equal(aggregateSharedProgress(query, neutral, current).state, "available", metric);
  }
});

test("query constraint/dimension sets are normalized without mutating input and require exact task constraints", () => {
  const query = sharedQuery();
  query.required_quality_dimensions = ["verification", "correctness"];
  const original = structuredClone(query);
  const rows = sharedRows().map(row => {
    row.candidate.task.constraints.reverse();
    row.capability_evidence!.quality_checks.push({ dimension: "verification", result: "met", evaluator: "tool", basis: "locally_recorded" });
    return row;
  });
  const result = aggregateSharedProgress(query, rows, current);
  assert.equal(result.state, "available");
  assert.deepEqual(result.cohort!.task.constraints, [...original.task.constraints].sort());
  assert.deepEqual(result.cohort!.required_quality_dimensions, ["correctness", "verification"]);
  assert.deepEqual(query, original);
  result.cohort!.task.constraints.push("time_bounded");
  assert.deepEqual(query, original);
});

test("no threshold, free-text grouping, owner filter, raw-token band or arbitrary query version is accepted", () => {
  for (const addition of [
    { minimum_distinct_owners: 1 }, { server_owner_id: "TEST_ONLY_OWNER" }, { token_band: "low" },
    { group: "job_title" }, { since: "2026-01-01" }, { rank: true }, { benchmark_conditions_version: "arbitrary" },
  ]) {
    const result = aggregateSharedProgress({ ...sharedQuery(), ...addition }, sharedRows(), current);
    assert.equal(result.state, "invalid_input"); noStatistics(result);
  }
  for (const patch of [
    { version: "future" }, { framework_version: "future" }, { rubric_id: "future" }, { metric_definition_version: "future" },
    { comparison: "none" }, { metric: "raw_tokens" }, { direction: "higher_is_better" }, { metric_provenance: "unknown" },
    { quality_evaluator: "unknown" }, { quality_basis: "unknown" }, { server_trust_tier: "client_verified" },
    { required_quality_dimensions: [] }, { required_quality_dimensions: ["correctness", "correctness"] },
    { required_quality_dimensions: ["invented"] }, { metric: "estimated_api_cost", metric_provenance: "self_reported" },
  ]) assert.equal(aggregateSharedProgress({ ...sharedQuery(), ...patch } as never, sharedRows(), current).state, "invalid_input");
});

test("unknown/future/nested-extra task and condition fields cannot define an exact cohort", () => {
  for (const patch of [
    { difficulty: "unknown" }, { difficulty_basis: "unknown" }, { task_contract_version: "future" },
    { constraints: ["fixed_inputs", "fixed_inputs"] }, { employer: "TEST_ONLY_EXTRA" },
  ]) {
    const query = sharedQuery(); Object.assign(query.task, patch);
    assert.equal(aggregateSharedProgress(query, sharedRows(), current).state, "invalid_input");
  }
  for (const patch of [{ platform: "unknown" }, { model_tier: "unknown" }, { exact_model: "TEST_ONLY_EXTRA" }]) {
    const query = sharedQuery(); Object.assign(query.conditions.baseline, patch);
    assert.equal(aggregateSharedProgress(query, sharedRows(), current).state, "invalid_input");
  }
});

test("invalid records and conflicting current owners fail closed without exposing operational fields", () => {
  for (const patch of [
    { server_owner_id: "" }, { server_owner_id: "TEST OWNER" }, { server_owner_id: "x".repeat(129) },
    { public_id: "invalid" }, { current: "true" }, { status: "future" },
    { benchmark_conditions_version: "bl-approval-binding-readonly-0.1" },
    { raw_tokens: 1234 }, { consent_hash: "TEST_ONLY_HASH" }, { owner_email: "TEST_ONLY_EXTRA" },
  ]) {
    const rows = sharedRows(); Object.assign(rows[0]!, patch);
    const result = aggregateSharedProgress(sharedQuery(), rows, current);
    assert.equal(result.state, "invalid_input", JSON.stringify(patch)); noStatistics(result);
  }
  const rows = sharedRows();
  const conflict = structuredClone(rows[0]!); conflict.server_owner_id = "TEST_ONLY_DIFFERENT_OWNER";
  assert.equal(aggregateSharedProgress(sharedQuery(), [...rows, conflict], current).state, "invalid_input");
  conflict.current = false;
  assert.equal(aggregateSharedProgress(sharedQuery(), [...rows, conflict], current).state, "available");
  conflict.current = true; conflict.server_owner_id = rows[0]!.server_owner_id; conflict.consent!.benchmark_aggregation = false;
  assert.equal(aggregateSharedProgress(sharedQuery(), [...rows, conflict], current).state, "invalid_input");
});

test("metric duplicates, unknown capsule versions and contradictory attribution cannot inflate results", () => {
  const mutations: Array<(row: SharedSignalRecord) => void> = [
    row => { row.candidate.kpis.push(structuredClone(row.candidate.kpis[0]!)); },
    row => { row.candidate.kpis[0]!.baseline_index = 0 as never; },
    row => { row.candidate.kpis[0]!.candidate_index = 103; },
    row => { row.candidate.kpis[0]!.metric_definition_version = "future" as never; },
    row => { row.capability_evidence!.schema_version = "future" as never; },
    row => { row.capability_evidence!.human_involvement = "agent_autonomous"; },
    row => { row.capability_evidence!.quality_checks[0]!.evaluator = "unknown"; },
    row => { row.consent!.public_story = false as never; },
  ];
  for (const mutate of mutations) {
    const rows = sharedRows(); mutate(rows[0]!);
    const result = aggregateSharedProgress(sharedQuery(), rows, current);
    assert.ok(result.state === "invalid_input" || result.state === "suppressed");
    noStatistics(result);
  }
});

test("unavailable snapshots and oversized inputs return no cohort hints or values", () => {
  for (const context of [{ source: "offline_snapshot" as const, complete: true }, { ...current, complete: false }]) {
    const result = aggregateSharedProgress(sharedQuery(), sharedRows(), context);
    assert.equal(result.state, "current_snapshot_required"); noStatistics(result);
  }
  assert.equal(aggregateSharedProgress(sharedQuery(), sharedRows(), { ...current, cached: true } as never).state, "invalid_input");
  assert.equal(aggregateSharedProgress(sharedQuery(), sharedRows(1001), current).state, "invalid_input");
  const rows = sharedRows(); rows[0]!.candidate.story.lesson = "x".repeat(40_000);
  assert.equal(aggregateSharedProgress(sharedQuery(), rows, current).state, "invalid_input");
  assert.equal(aggregateSharedProgress(sharedQuery(), null as never, current).state, "invalid_input");
});

test("available projection has no public/owner IDs, raw metrics, consent, narrative or per-person outputs", () => {
  const result = aggregateSharedProgress(sharedQuery(), sharedRows(), current);
  assert.equal(result.state, "available");
  const json = JSON.stringify(result);
  for (const forbidden of [
    "TEST_ONLY", "00000000-0000", "server_owner_id", "public_id", "public_story", "policy_version",
    "owner_email", "candidate_index_per_owner", "raw_tokens", '"kpis"', '"human_actions"', '"benchmark"', '"story"',
  ]) assert.equal(json.includes(forbidden), false, forbidden);
  assert.match(json, /privacy heuristics/);
});

test("all new public helpers are synchronous and perform zero network calls", () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => { calls++; throw new Error("network_forbidden_in_pure_fixture"); }) as typeof fetch;
  try {
    assert.equal(listSharedChallenges().length, 8);
    assert.equal(findRelatedLessons(learningQuery(), [publicSharedRow()], current).state, "available");
    assert.equal(aggregateSharedProgress(sharedQuery(), sharedRows(), current).state, "available");
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test("JSON input snapshots reject getters and toJSON hooks without invoking them", () => {
  let invoked = 0;
  const query = sharedQuery();
  Object.defineProperty(query, "task", { enumerable: true, get() { invoked++; throw new Error("must_not_run"); } });
  assert.equal(aggregateSharedProgress(query, [], current).state, "invalid_input");
  const record = sharedRow();
  Object.defineProperty(record, "server_owner_id", { enumerable: true, get() { invoked++; throw new Error("must_not_run"); } });
  assert.equal(aggregateSharedProgress(sharedQuery(), [record], current).state, "invalid_input");
  const lesson = publicSharedRow();
  Object.assign(lesson.candidate.story, { toJSON() { invoked++; throw new Error("must_not_run"); } });
  assert.equal(findRelatedLessons(learningQuery(), [lesson], current).state, "invalid_input");
  assert.equal(invoked, 0);
});

test("the full 1000-record bound is processed without truncating eligible owner counts", () => {
  const rows = sharedRows(1000);
  const result = aggregateSharedProgress(sharedQuery(), rows, current);
  assert.equal(result.state, "available");
  assert.equal(result.statistics!.distinct_owners_rounded_down_to_5, 1000);
  assert.equal(result.statistics!.mean_candidate_index, 100);
  const publicRows = rows.map(({ server_owner_id: _owner, ...row }) => row);
  const learning = findRelatedLessons(learningQuery(), publicRows, current);
  assert.equal(learning.lessons.length, 6);
  assert.equal(learning.has_more, true);
});
