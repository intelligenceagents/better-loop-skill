import { validateEvaluationRun } from "@better-loop/contracts";
import type {
  EvaluationDraft, EvaluationInput, EvaluationRun, MeasurementOptions, MeasurementReport, MeasurementResult,
  MetricUnit, Outcome, PairMeasurement, RepeatedMilestone, Trial,
} from "./types.js";
import { compareTasks } from "./compatibility.js";
import { MeasurementInputError, equal, fail, mean, object, snapshot, timestamp } from "./guards.js";
import { measurePair, pairedUncertainty } from "./metrics.js";
import { verifyRegistration } from "./protocol.js";
import { evaluateQuality } from "./quality.js";
import { accountTelemetry } from "./telemetry.js";

const DRAFT_KEYS = ["schema_version", "framework_version", "content_origin", "run_id", "task_instance_id", "task", "protocol", "conditions", "observations", "trials"];
const outcomes: Outcome[] = ["improved", "no_change", "regressed", "mixed", "insufficient_evidence"];
const timingMetrics = ["model_tokens", "model_duration", "human_effort", "estimated_api_cost"] as const;

function safeErrors(code: string): MeasurementResult { return { valid: false, errors: [{ code, path: "" }] }; }
function optionalMap(value: unknown, keys: readonly string[], code: string): void {
  if (value !== null && typeof value === "object" && !Array.isArray(value) &&
      Object.keys(value).every(key => keys.includes(key))) return;
  fail(code);
}

function initialRecord(input: unknown): EvaluationRun {
  const draft = snapshot(input) as EvaluationDraft;
  object(draft, DRAFT_KEYS, "invalid_evaluation_draft");
  if (!Array.isArray(draft.trials) || draft.trials.length > 1000 || !draft.protocol) fail("invalid_evaluation_draft");
  const relative = draft.trials.map(trial => {
    const b = trial?.baseline;
    const c = trial?.candidate;
    const before = b?.metrics?.[draft.protocol.primary_metric];
    const after = c?.metrics?.[draft.protocol.primary_metric];
    if (b?.status !== "completed" || c?.status !== "completed" || typeof before !== "number" ||
        typeof after !== "number" || before <= 0) return null;
    const result = measurePair(before, after, draft.protocol.direction);
    if (result.reason === "numeric_overflow") fail("numeric_overflow");
    return result.relative_change_percent;
  });
  const record = { ...draft, summary: {
    outcome: "insufficient_evidence" as const, paired_relative_changes_percent: relative,
    uncertainty: "Measurement pending.", limitations: [],
  } };
  const validated = validateEvaluationRun(record);
  if (!validated.valid) fail("invalid_evaluation_contract");
  return validated.data;
}

function checkTiming(trial: Trial): void {
  for (const arm of [trial.baseline, trial.candidate]) {
    const started = arm.started_at === null ? null : timestamp(arm.started_at);
    const finished = arm.finished_at === null ? null : timestamp(arm.finished_at);
    if (started !== null && finished !== null && finished < started) fail("finish_before_start");
    if (arm.status === "not_run" && (started !== null || finished !== null ||
        Object.values(arm.metrics).some(value => value !== null) ||
        arm.quality_floor_passed !== null || arm.critical_regression !== null)) fail("not_run_has_measurements");
    if (arm.status === "completed" && arm.failure_or_omission_reason !== null) fail("completed_with_failure_reason");
    for (const key of ["model_tokens", "rework_cycles"] as const) {
      if (arm.metrics[key] !== null && !Number.isSafeInteger(arm.metrics[key])) fail("non_integer_count_metric");
    }
  }
  if (trial.baseline.started_at && trial.candidate.started_at) {
    const b = timestamp(trial.baseline.started_at); const c = timestamp(trial.candidate.started_at);
    if (trial.order === "baseline_first" ? b >= c : c >= b) fail("trial_order_mismatch");
  }
}

function qualityReasons(trial: Trial): string[] {
  const reasons: string[] = [];
  if (trial.candidate.quality_floor_passed !== true) reasons.push(
    trial.candidate.quality_floor_passed === false ? "quality_floor_not_met" : "quality_floor_unknown");
  if (trial.candidate.critical_regression !== false) reasons.push(
    trial.candidate.critical_regression === true ? "critical_quality_regression" : "critical_quality_regression_unknown");
  return reasons;
}
function pairResult(trial: Trial, record: EvaluationRun, unit: MetricUnit): PairMeasurement {
  const metric = record.protocol.primary_metric;
  const completed = trial.baseline.status === "completed" && trial.candidate.status === "completed";
  const delta = measurePair(trial.baseline.metrics[metric], trial.candidate.metrics[metric], record.protocol.direction, unit);
  const reasons = qualityReasons(trial);
  let outcome: Outcome = "insufficient_evidence";
  if (!completed) reasons.unshift("pair_not_completed");
  else if (delta.relative_change_percent === null) reasons.unshift(delta.reason ?? "relative_change_unavailable");
  else if (trial.candidate.quality_floor_passed === null || trial.candidate.critical_regression === null) {
    // Unknown quality cannot establish an improvement or an unchanged acceptable result.
  } else if (reasons.length) outcome = delta.relative_change_percent > 0 ? "mixed" : "regressed";
  else outcome = delta.relative_change_percent > 0 ? "improved" : delta.relative_change_percent < 0 ? "regressed" : "no_change";
  return {
    pair_id: trial.pair_id, baseline_status: trial.baseline.status, candidate_status: trial.candidate.status,
    delta: completed ? delta : {
      ...delta, absolute_change: null, favorable_absolute_change: null, percentage_point_change: null,
      relative_change_percent: null, baseline_index: null, candidate_index: null, reason: "pair_not_completed",
    },
    outcome, reasons,
  };
}
function overall(pairs: PairMeasurement[]): Outcome {
  if (pairs.some(pair => pair.outcome === "insufficient_evidence")) return "insufficient_evidence";
  if (pairs.some(pair => pair.outcome === "mixed") ||
      (pairs.some(pair => pair.outcome === "improved") && pairs.some(pair => pair.outcome === "regressed"))) return "mixed";
  if (pairs.some(pair => pair.outcome === "regressed")) return "regressed";
  if (pairs.some(pair => pair.outcome === "improved")) return "improved";
  return "no_change";
}
function defaultUnit(record: EvaluationRun): MetricUnit {
  switch (record.protocol.primary_metric) {
    case "model_duration": case "human_effort": return "seconds";
    case "estimated_api_cost": return "USD";
    case "quality_rubric": return "index";
    default: return "count";
  }
}

function runMeasurement(record: EvaluationRun, inputOptions: MeasurementOptions): MeasurementResult {
  const options = snapshot(inputOptions);
  optionalMap(options, ["registration", "quality", "telemetry", "shared_telemetry"], "invalid_measurement_options");
  if (Object.hasOwn(options, "registration") && options.registration === undefined) fail("invalid_registration");
  const ids = record.trials.map(trial => trial.pair_id);
  if (options.quality !== undefined) object(options.quality, ids, "quality_pairs_mismatch");
  if (options.telemetry !== undefined) object(options.telemetry, ids, "telemetry_pairs_mismatch");
  record.trials.forEach(checkTiming);

  const registration = options.registration;
  const registrationCheck = registration ? verifyRegistration(record, registration) :
    { verified: false, reasons: ["registration_not_supplied"] };
  const verifiedRegistration = registrationCheck.verified ? registration : undefined;
  const compatibility = verifiedRegistration ? compareTasks(
    verifiedRegistration.evidence.baseline, verifiedRegistration.evidence.candidate,
    verifiedRegistration.evidence.allowed_condition_changes,
  ) : {
    similarity: "same_taxonomy" as const, status: "unknown" as const, reasons: ["comparability_context_not_verified"],
  };
  const reasons: string[] = [...registrationCheck.reasons];
  if (compatibility.status !== "comparable" || record.protocol.compatibility !== "comparable") reasons.push("comparability_not_established");
  if (record.content_origin === "synthetic") reasons.push("synthetic_measurements_ineligible");
  if (record.task.benchmark_contract === "unregistered") reasons.push("benchmark_contract_unregistered");
  if (options.quality && !verifiedRegistration) fail("quality_rule_registration_required");
  if (!options.quality) reasons.push("dimension_quality_evidence_not_supplied");
  if (!options.telemetry) reasons.push("telemetry_ledger_not_supplied");
  const telemetryReport: MeasurementReport["telemetry"] = {
    pairs: [], shared_overhead: options.shared_telemetry !== undefined ? accountTelemetry(options.shared_telemetry) : null,
  };
  const eventIds = new Set<string>();
  const allLedgers = [
    ...Object.values(options.telemetry ?? {}).flatMap(pair => [pair.baseline, pair.candidate]),
    ...(options.shared_telemetry ? [options.shared_telemetry] : []),
  ];
  for (const ledger of allLedgers) {
    accountTelemetry(ledger);
    for (const entry of ledger.entries) {
      if (eventIds.has(entry.id)) fail("telemetry_event_reused_across_arms");
      eventIds.add(entry.id);
    }
  }

  for (const trial of record.trials) {
    if (options.quality && verifiedRegistration) {
      const evaluated = evaluateQuality(verifiedRegistration.evidence.quality_rule, options.quality[trial.pair_id]!);
      if (trial.baseline.quality_floor_passed !== evaluated.baseline_floor_passed ||
          trial.candidate.quality_floor_passed !== evaluated.quality_floor_passed ||
          trial.candidate.critical_regression !== evaluated.critical_regression) fail("quality_attestation_mismatch");
    }
    if (options.telemetry) {
      const pairTelemetry = options.telemetry[trial.pair_id]!;
      object(pairTelemetry, ["baseline", "candidate"], "invalid_pair_telemetry");
      telemetryReport.pairs.push({
        pair_id: trial.pair_id, baseline: accountTelemetry(pairTelemetry.baseline), candidate: accountTelemetry(pairTelemetry.candidate),
      });
      for (const side of ["baseline", "candidate"] as const) {
        const totals = accountTelemetry(pairTelemetry[side]);
        if (trial[side].status === "not_run") {
          if (pairTelemetry[side].entries.length || Object.values(pairTelemetry[side].coverage).some(value => value !== "not_applicable")) {
            fail("not_run_has_telemetry");
          }
          continue;
        }
        const expected = {
          model_tokens: totals.model_tokens.total,
          model_duration: totals.model_duration_seconds.total,
          human_effort: totals.human_effort_seconds.total,
          estimated_api_cost: totals.estimated_api_cost_usd.total,
        };
        for (const metric of timingMetrics) {
          if (trial[side].metrics[metric] !== expected[metric]) fail("telemetry_metric_mismatch");
        }
        if (!totals.model_tokens.complete) reasons.push("actual_token_telemetry_incomplete");
        if (timingMetrics.includes(record.protocol.primary_metric as typeof timingMetrics[number]) &&
            expected[record.protocol.primary_metric as keyof typeof expected] === null) reasons.push("primary_overhead_incomplete");
      }
    }
  }

  const unit = verifiedRegistration?.evidence.baseline.metric_unit ?? defaultUnit(record);
  const pairs = record.trials.map(trial => pairResult(trial, record, unit));
  let outcome = overall(pairs);
  if (compatibility.status !== "comparable" || record.protocol.compatibility !== "comparable" ||
      (record.protocol.kind === "controlled_paired" && !record.protocol.frozen_before_execution)) outcome = "insufficient_evidence";
  const relative = pairs.map(pair => pair.delta.relative_change_percent);
  const uncertainty = pairedUncertainty(relative, verifiedRegistration?.evidence.independent_pairs ?? false);
  const observed = relative.filter((value): value is number => value !== null);
  const absolute = pairs.filter(pair => pair.baseline_status === "completed" && pair.candidate_status === "completed")
    .map(pair => pair.delta.absolute_change).filter((value): value is number => value !== null);
  const counts = Object.fromEntries(outcomes.map(label => [label, pairs.filter(pair => pair.outcome === label).length])) as Record<Outcome, number>;
  const limitations = [
    "Local supplied measurements and registration are not independently verified; no person ranking or calibrated causal claim.",
    "Five paired trials and three distinct tasks are product gates, not established statistical sufficiency.",
    "All planned outcomes are retained. Numerical means describe observed pairs only; missing/failed pairs are not zero.",
    "Token use, model duration, human effort, estimated API cost, and actual billing are separate; token reduction is not cash savings.",
    "Rounded public indices lose detail and any percent claim derived from them is approximate.",
  ];
  if (record.protocol.kind === "observational_followup") limitations.push("Observational follow-up has selection effects and task differences; it cannot establish causation.");
  if (record.content_origin === "synthetic") limitations.push("Synthetic measurements test the engine and are ineligible as genuine benchmark evidence.");
  if (uncertainty.unavailable_reason) limitations.push(`Median confidence interval unavailable: ${uncertainty.unavailable_reason}.`);
  if (!verifiedRegistration) limitations.push("Without verified frozen context, pair deltas remain descriptive and overall evidence is insufficient.");
  if (observed.length !== pairs.length) limitations.push("Incomplete pairs prevent an all-pair mean or improvement eligibility; observed-pair statistics may be selected.");
  if (telemetryReport.shared_overhead) {
    limitations.push("Protocol-wide overhead is reported separately, without invented per-arm allocation; pair deltas exclude that shared work.");
    if (!telemetryReport.shared_overhead.model_tokens.complete) reasons.push("shared_token_overhead_incomplete");
  }

  // Budgets concern all consumed run effort, including failed runs, not only completed pairs.
  for (const [budget, metric] of [
    [record.protocol.resource_budget.max_total_tokens, "model_tokens"],
    [record.protocol.resource_budget.max_duration_seconds, "model_duration"],
  ] as const) {
    if (budget === null) continue;
    const values = record.trials.flatMap(trial => [trial.baseline, trial.candidate])
      .filter(arm => arm.status !== "not_run").map(arm => arm.metrics[metric]);
    if (telemetryReport.shared_overhead) values.push(metric === "model_tokens" ?
      telemetryReport.shared_overhead.model_tokens.total : telemetryReport.shared_overhead.model_duration_seconds.total);
    if (values.some(value => value === null)) reasons.push("budget_usage_unknown");
    else if (values.reduce<number>((total, value) => total + value!, 0) > budget) reasons.push("resource_budget_exceeded");
  }
  const evidenceReasons = [...new Set(reasons)];
  const actualBenchmark = record.content_origin === "public_benchmark" && evidenceReasons.length === 0 &&
    record.trials.some(trial => trial.baseline.status !== "not_run" || trial.candidate.status !== "not_run");
  if (telemetryReport.shared_overhead && record.protocol.primary_metric !== "quality_rubric" &&
      record.protocol.primary_metric !== "rework_cycles") reasons.push("shared_resource_overhead_not_pair_attributable");
  if (pairs.length < 5) reasons.push("fewer_than_five_pairs");
  if (outcome !== "improved") reasons.push("outcome_not_improved");
  if (pairs.some(pair => pair.baseline_status !== "completed" || pair.candidate_status !== "completed")) reasons.push("incomplete_trial");
  if (observed.length !== pairs.length) reasons.push("primary_measurement_missing_or_undefined");
  const eligibilityReasons = [...new Set(reasons)];
  const report: MeasurementReport = {
    version: "bl-measurement-0.1", run_id: record.run_id, task_instance_id: record.task_instance_id,
    evidence_track: record.protocol.kind, content_origin: record.content_origin, outcome, pairs, counts,
    execution_claim: record.content_origin === "synthetic" ? "invented_fixture" :
      !record.trials.some(trial => trial.baseline.status !== "not_run" || trial.candidate.status !== "not_run") ? "no_execution_reported" :
        record.content_origin === "public_benchmark" ? "reported_host_execution" : "reported_private_work",
    mean_relative_change_percent: mean(observed), mean_absolute_change: mean(absolute), uncertainty,
    eligibility: {
      preliminary_measured_improvement: eligibilityReasons.length === 0,
      actual_benchmark_evidence: actualBenchmark, human_achievement_evidence: false, population_cohort_evidence: false,
      reasons: eligibilityReasons,
    },
    telemetry: telemetryReport,
    registration_verified: registrationCheck.verified, compatibility, limitations,
  };
  const uncertaintyText = uncertainty.interval_percent ?
    `Exact order-statistic 95% median interval [${uncertainty.interval_percent[0]}, ${uncertainty.interval_percent[1]}] percent; achieved coverage ${uncertainty.interval_coverage}. Assumes independent pairs; not a mean interval or causal proof.` :
    `No finite justified 95% median interval: ${uncertainty.unavailable_reason}. Observed pairs ${observed.length}/${pairs.length}; range is descriptive only.`;
  record.summary = { outcome, paired_relative_changes_percent: relative, uncertainty: uncertaintyText, limitations };
  const checked = validateEvaluationRun(record);
  if (!checked.valid) fail("computed_record_contract_failure");
  return { valid: true, record: checked.data, report };
}

/** Draft = existing EvaluationRun wire contract with its derived summary omitted. Never mutates input. */
export function measureEvaluation(draft: unknown, options: MeasurementOptions = {}): MeasurementResult {
  try { return runMeasurement(initialRecord(draft), options); }
  catch (error) { return safeErrors(error instanceof MeasurementInputError ? error.code : "invalid_measurement_input"); }
}

/** Structural/semantic validation happens before recomputation; false submitted percentages reject. */
export function analyzeEvaluation(input: unknown, options: MeasurementOptions = {}): MeasurementResult {
  const validation = validateEvaluationRun(input);
  if (!validation.valid) return { valid: false, errors: validation.errors.map(error => ({ code: error.code, path: error.path })) };
  try { return runMeasurement(validation.data, options); }
  catch (error) { return safeErrors(error instanceof MeasurementInputError ? error.code : "invalid_measurement_input"); }
}

/** Recompute inputs, collapse reruns per task, reject copied input identities, and never select the best rerun. */
export function repeatedImprovement(inputs: readonly EvaluationInput[]): RepeatedMilestone {
  if (!Array.isArray(inputs) || inputs.length > 1000) fail("invalid_milestone_inputs");
  const result: RepeatedMilestone = {
    eligible: false, minimum_distinct_tasks: 3, minimum_pairs_per_task: 5,
    qualifying_task_ids: [], excluded: [], reasons: [], claim: null,
  };
  const evaluated = inputs.map(input => {
    optionalMap(input, ["record", "options"], "invalid_milestone_input");
    return { input, measured: analyzeEvaluation(input.record, input.options) };
  });
  const valid = evaluated.filter((entry): entry is typeof entry & { measured: Extract<MeasurementResult, { valid: true }> } => entry.measured.valid);
  if (valid.length !== inputs.length) result.reasons.push("invalid_evaluation_inputs");
  const duplicateRuns = new Set(valid.filter((entry, i, all) =>
    all.some((other, j) => i !== j && other.measured.record.run_id === entry.measured.record.run_id)).map(entry => entry.measured.record.run_id));
  const tasks = new Map<string, typeof valid>();
  for (const entry of valid) {
    const id = entry.measured.record.task_instance_id;
    tasks.set(id, [...(tasks.get(id) ?? []), entry]);
  }
  let representative: typeof valid[number] | undefined;
  for (const [taskId, entries] of tasks) {
    const exclusions: string[] = [];
    if (entries.some(entry => duplicateRuns.has(entry.measured.record.run_id))) exclusions.push("duplicate_run_id");
    if (entries.some(entry => !entry.measured.report.eligibility.preliminary_measured_improvement)) exclusions.push("task_has_ineligible_or_non_improved_run");
    const first = entries[0]!;
    const registration = first.input.options?.registration;
    if (!registration) exclusions.push("registration_not_supplied");
    if (registration && entries.some(entry => entry.input.options?.registration?.evidence.task_fingerprint !== registration.evidence.task_fingerprint)) {
      exclusions.push("task_identity_changed");
    }
    if (registration && valid.some(entry => entry.measured.record.task_instance_id !== taskId &&
        entry.input.options?.registration?.evidence.task_fingerprint === registration.evidence.task_fingerprint)) exclusions.push("copied_task_fingerprint");
    if (representative && registration) {
      const reference = representative.input.options!.registration!;
      const comparison = compareTasks(reference.evidence.baseline, registration.evidence.baseline);
      const candidateComparison = compareTasks(reference.evidence.candidate, registration.evidence.candidate);
      if (comparison.status !== "comparable" || candidateComparison.status !== "comparable" ||
          first.measured.record.protocol.kind !== representative.measured.record.protocol.kind ||
          first.measured.record.protocol.primary_metric !== representative.measured.record.protocol.primary_metric ||
          first.measured.record.protocol.intervention !== representative.measured.record.protocol.intervention ||
          !equal(reference.evidence.quality_rule, registration.evidence.quality_rule)) exclusions.push("incompatible_task_cohort");
    }
    if (exclusions.length) {
      entries.forEach(entry => result.excluded.push({ run_id: entry.measured.record.run_id, reasons: [...new Set(exclusions)] }));
    } else {
      representative ??= first;
      result.qualifying_task_ids.push(taskId);
      entries.slice(1).forEach(entry => result.excluded.push({ run_id: entry.measured.record.run_id, reasons: ["rerun_not_an_additional_task"] }));
    }
  }
  if (result.qualifying_task_ids.length < 3) result.reasons.push("fewer_than_three_distinct_comparable_tasks");
  if (result.excluded.some(entry => entry.reasons.includes("incompatible_task_cohort"))) result.reasons.push("multiple_incompatible_cohorts");
  result.eligible = result.reasons.length === 0;
  if (result.eligible && representative) result.claim = representative.measured.record.protocol.kind === "controlled_paired" ?
    "controlled_task_improvement" : "observational_followup";
  return result;
}
