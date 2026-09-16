import assert from "node:assert/strict";
import test from "node:test";
import { validateEvaluationRun } from "@better-loop/contracts";
import type { EvaluationDraft, MeasurementOptions } from "../src/index.js";
import { analyzeEvaluation, measureEvaluation } from "../src/index.js";
import { draft, ledger, measured, prepare, refreeze, rejected, withoutSummary } from "./fixtures.js";

test("unregistered draft returns all descriptive deltas, never a supported improvement", () => {
  const input = draft(); const before = structuredClone(input);
  const result = measured(measureEvaluation(input));
  assert.deepEqual(result.record.summary.paired_relative_changes_percent, [30, 20, 25, 25, 25]);
  assert.equal(result.report.mean_relative_change_percent, 25);
  assert.equal(result.report.outcome, "insufficient_evidence");
  assert.equal(result.report.eligibility.preliminary_measured_improvement, false);
  assert.equal(result.report.pairs.length, 5);
  assert.deepEqual(input, before);
});
test("registered synthetic fixture can describe improvement but is never actual benchmark evidence", () => {
  const { draft: input, options } = prepare();
  const result = measured(measureEvaluation(input, options));
  assert.equal(result.report.outcome, "improved");
  assert.equal(result.report.eligibility.actual_benchmark_evidence, false);
  assert.equal(result.report.eligibility.preliminary_measured_improvement, false);
  assert.ok(result.report.eligibility.reasons.includes("synthetic_measurements_ineligible"));
  assert.equal(validateEvaluationRun(result.record).valid, true);
  assert.equal(result.report.uncertainty.interval_percent, null);
});
test("hypothetical eligibility branch requires registered genuine-origin evidence; test values remain invented", () => {
  const input = draft(); input.content_origin = "public_benchmark";
  const prepared = prepare(input);
  const result = measured(measureEvaluation(prepared.draft, prepared.options));
  assert.equal(result.report.eligibility.preliminary_measured_improvement, true);
  assert.equal(result.report.eligibility.actual_benchmark_evidence, true);
  assert.equal(result.report.uncertainty.interval_percent, null);
});
test("complete record analysis recomputes submitted outcome while rejecting false submitted percentages", () => {
  const { draft: input, options } = prepare();
  const initial = measured(measureEvaluation(input, options));
  initial.record.summary.outcome = "no_change";
  assert.equal(measured(analyzeEvaluation(initial.record, options)).report.outcome, "improved");
  initial.record.summary.paired_relative_changes_percent[0] = 99;
  assert.ok(rejected(analyzeEvaluation(initial.record, options)).includes("relative_change_mismatch"));
});
for (const mutation of [
  (r: EvaluationDraft) => { r.trials.pop(); },
  (r: EvaluationDraft) => { r.trials.push(structuredClone(r.trials[0]!)); },
  (r: EvaluationDraft) => { r.protocol.planned_pair_ids.push("omitted"); },
  (r: EvaluationDraft) => { r.trials[0]!.pair_id = "unplanned"; },
]) {
  test("omitted, duplicate or unplanned outcomes reject instead of being silently dropped", () => {
    const input = draft(); mutation(input);
    assert.ok(rejected(measureEvaluation(input)).includes("invalid_evaluation_contract"));
  });
}
for (const status of ["failed", "timed_out", "not_run"] as const) {
  test(`${status} is retained with a reason and blocks improvement`, () => {
    const input = draft(); const arm = input.trials[1]!.candidate;
    arm.status = status; arm.failure_or_omission_reason = "Invented failure case.";
    arm.quality_floor_passed = null; arm.critical_regression = null;
    if (status === "not_run") {
      Object.keys(arm.metrics).forEach(key => { arm.metrics[key as keyof typeof arm.metrics] = null; });
    }
    const result = measured(measureEvaluation(input));
    assert.equal(result.report.pairs.length, 5);
    assert.equal(result.record.trials[1]!.candidate.status, status);
    assert.equal(result.record.summary.paired_relative_changes_percent[1], null);
    assert.equal(result.report.counts.insufficient_evidence, 1);
    assert.equal(result.report.mean_relative_change_percent, 26.25);
  });
}
test("failure without reason and not-run with invented usage reject", () => {
  const input = draft(); input.trials[0]!.candidate.status = "failed";
  assert.ok(rejected(measureEvaluation(input)).includes("invalid_evaluation_contract"));
  input.trials[0]!.candidate.status = "not_run";
  input.trials[0]!.candidate.failure_or_omission_reason = "Invented omission.";
  assert.ok(rejected(measureEvaluation(input)).includes("not_run_has_measurements"));
});
for (const value of [null, 0]) {
  test(`baseline ${value} creates no false relative win or Infinity`, () => {
    const input = draft(); input.trials[0]!.baseline.metrics.model_tokens = value;
    const result = measured(measureEvaluation(input));
    assert.equal(result.record.summary.paired_relative_changes_percent[0], null);
    assert.equal(result.report.eligibility.preliminary_measured_improvement, false);
    assert.equal(result.report.pairs[0]!.delta.baseline_index, null);
  });
}
test("mixed favorable/adverse pairs remain mixed even if average is favorable", () => {
  const prepared = prepare();
  prepared.draft.trials[0]!.candidate.metrics.model_tokens = 1100;
  prepared.options.telemetry!["pair-1"]!.candidate = ledger(1100);
  const result = measured(measureEvaluation(prepared.draft, prepared.options));
  assert.equal(result.report.mean_relative_change_percent, 17);
  assert.equal(result.report.outcome, "mixed");
  assert.equal(result.report.counts.regressed, 1);
});
for (const [tokens, expected] of [[1000, "no_change"], [1200, "regressed"]] as const) {
  test(`all ${expected} trials are retained and reported without a win`, () => {
    const prepared = prepare();
    prepared.draft.trials.forEach(trial => {
      trial.candidate.metrics.model_tokens = tokens;
      prepared.options.telemetry![trial.pair_id]!.candidate = ledger(tokens);
      prepared.options.telemetry![trial.pair_id]!.candidate.entries[0]!.id = `invented-${trial.pair_id}-replacement`;
    });
    const result = measured(measureEvaluation(prepared.draft, prepared.options));
    assert.equal(result.report.outcome, expected);
    assert.equal(result.report.counts[expected], 5);
  });
}
test("quality regression blocks a favorable primary metric; scores cannot contradict attestations", () => {
  const prepared = prepare();
  prepared.options.quality!["pair-1"]!.candidate.acceptance = 0;
  assert.ok(rejected(measureEvaluation(prepared.draft, prepared.options)).includes("quality_attestation_mismatch"));
  prepared.draft.trials[0]!.candidate.quality_floor_passed = false;
  prepared.draft.trials[0]!.candidate.critical_regression = true;
  const result = measured(measureEvaluation(prepared.draft, prepared.options));
  assert.equal(result.report.outcome, "mixed");
  assert.equal(result.report.eligibility.preliminary_measured_improvement, false);
});
test("unknown floor or critical quality never passes improvement", () => {
  const prepared = prepare();
  prepared.options.quality!["pair-1"]!.candidate.acceptance = null;
  prepared.draft.trials[0]!.candidate.quality_floor_passed = null;
  prepared.draft.trials[0]!.candidate.critical_regression = null;
  assert.equal(measured(measureEvaluation(prepared.draft, prepared.options)).report.outcome, "insufficient_evidence");
});
test("telemetry catches omitted judge/retry costs and unknown totals may not be replaced by subtotals", () => {
  const prepared = prepare();
  prepared.options.telemetry!["pair-1"]!.candidate.coverage.judge = "missing";
  assert.ok(rejected(measureEvaluation(prepared.draft, prepared.options)).includes("telemetry_metric_mismatch"));
  prepared.draft.trials[0]!.candidate.metrics.model_tokens = null;
  const result = measured(measureEvaluation(prepared.draft, prepared.options));
  assert.ok(result.report.eligibility.reasons.includes("actual_token_telemetry_incomplete"));
  assert.equal(result.report.outcome, "insufficient_evidence");
});
test("actual metric integer constraints, timestamps and declared execution order are checked", () => {
  const prepared = prepare();
  const input = structuredClone(prepared.draft); input.trials[0]!.candidate.metrics.model_tokens = 1.5;
  assert.ok(rejected(measureEvaluation(input)).includes("non_integer_count_metric"));
  input.trials[0]!.candidate.metrics.model_tokens = 700;
  input.trials[0]!.candidate.finished_at = "2019-01-01T00:00:00Z";
  assert.ok(rejected(measureEvaluation(input)).includes("finish_before_start"));
  input.trials[0]!.candidate.finished_at = prepared.draft.trials[0]!.candidate.finished_at;
  input.trials[0]!.order = "candidate_first";
  assert.ok(rejected(measureEvaluation(input)).includes("trial_order_mismatch"));
});
test("a changed plan cannot reuse registration, while a fresh version can", () => {
  const prepared = prepare(); prepared.draft.run_id = "invented-version-2";
  const options = { registration: prepared.options.registration! };
  assert.equal(measured(measureEvaluation(prepared.draft, options)).report.registration_verified, false);
  refreeze(prepared.draft, prepared.options);
  assert.equal(measured(measureEvaluation(prepared.draft, prepared.options)).report.registration_verified, true);
});
test("budget includes failed work and unknown budget accounting blocks eligibility", () => {
  const prepared = prepare();
  prepared.draft.protocol.resource_budget.max_total_tokens = 1000;
  refreeze(prepared.draft, prepared.options);
  assert.ok(measured(measureEvaluation(prepared.draft, prepared.options)).report.eligibility.reasons.includes("resource_budget_exceeded"));
  prepared.draft.protocol.resource_budget.max_duration_seconds = 60;
  refreeze(prepared.draft, prepared.options);
  assert.ok(measured(measureEvaluation(prepared.draft, prepared.options)).report.eligibility.reasons.includes("budget_usage_unknown"));
});
test("observational evidence stays a separate track with noncausal limitations", () => {
  const prepared = prepare();
  prepared.draft.protocol.kind = "observational_followup"; refreeze(prepared.draft, prepared.options);
  const result = measured(measureEvaluation(prepared.draft, prepared.options));
  assert.equal(result.report.evidence_track, "observational_followup");
  assert.ok(result.report.limitations.some(value => value.includes("cannot establish causation")));
});
test("unknown fields, getters, arbitrary errors and option entries never leak submitted values", () => {
  const input = draft(); Object.assign(input, { secret_fixture_key: "do not echo" });
  assert.ok(rejected(measureEvaluation(input)).includes("invalid_evaluation_draft"));
  let calls = 0;
  const getter = { get schema_version() { calls++; return "0.1.0"; } };
  assert.ok(rejected(measureEvaluation(getter)).includes("invalid_json_value"));
  assert.equal(calls, 0);
  const result = measureEvaluation(draft(), { unknown_secret: "do not echo" } as unknown as MeasurementOptions);
  assert.equal(JSON.stringify(result).includes("do not echo"), false);
  assert.ok(rejected(result).includes("invalid_measurement_options"));
});
test("generated record round-trips without mutation and derived summary is not accepted on draft path", () => {
  const prepared = prepare();
  const result = measured(measureEvaluation(prepared.draft, prepared.options));
  assert.ok(rejected(measureEvaluation(result.record)).includes("invalid_evaluation_draft"));
  assert.deepEqual(measured(measureEvaluation(withoutSummary(result.record), prepared.options)).record, result.record);
});
test("shared orchestration is counted without invented allocation and reused events reject", () => {
  const prepared = prepare(); prepared.draft.content_origin = "public_benchmark"; refreeze(prepared.draft, prepared.options);
  const shared = ledger(500);
  shared.entries[0]!.id = "invented-shared-event"; shared.entries[0]!.role = "orchestration";
  shared.coverage.parent = "not_applicable"; shared.coverage.orchestration = "complete";
  prepared.options.shared_telemetry = shared;
  const result = measured(measureEvaluation(prepared.draft, prepared.options));
  assert.equal(result.report.telemetry.shared_overhead!.model_tokens.total, 500);
  assert.equal(result.report.eligibility.actual_benchmark_evidence, true);
  assert.equal(result.report.eligibility.preliminary_measured_improvement, false);
  assert.ok(result.report.eligibility.reasons.includes("shared_resource_overhead_not_pair_attributable"));
  shared.entries[0]!.id = prepared.options.telemetry!["pair-1"]!.baseline.entries[0]!.id;
  assert.ok(rejected(measureEvaluation(prepared.draft, prepared.options)).includes("telemetry_event_reused_across_arms"));
});
test("all seven task families use the same measurement semantics without universal scoring", () => {
  for (const family of ["software", "analysis_finance", "research_strategy", "mathematics_science", "writing_design", "operations_education", "general"] as const) {
    const prepared = prepare(); prepared.draft.task.task_family = family; refreeze(prepared.draft, prepared.options);
    const result = measured(measureEvaluation(prepared.draft, prepared.options));
    assert.equal(result.report.mean_relative_change_percent, 25);
    assert.equal(result.report.eligibility.human_achievement_evidence, false);
    assert.equal(result.report.eligibility.population_cohort_evidence, false);
  }
});
test("failed execution still consumes the resource budget and never gets partial-work deltas", () => {
  const prepared = prepare();
  const arm = prepared.draft.trials[0]!.candidate;
  arm.status = "failed"; arm.failure_or_omission_reason = "Invented execution failure after consuming tokens.";
  arm.quality_floor_passed = false; arm.critical_regression = true;
  prepared.options.quality!["pair-1"]!.candidate.acceptance = 0;
  prepared.draft.protocol.resource_budget.max_total_tokens = 8300;
  refreeze(prepared.draft, prepared.options);
  const result = measured(measureEvaluation(prepared.draft, prepared.options));
  assert.ok(result.report.eligibility.reasons.includes("resource_budget_exceeded"));
  assert.equal(result.report.pairs[0]!.delta.absolute_change, null);
  assert.equal(result.report.pairs[0]!.delta.relative_change_percent, null);
  assert.equal(result.report.telemetry.pairs[0]!.candidate.model_tokens.total, 700);
  assert.equal(result.report.pairs.length, 5);
});
