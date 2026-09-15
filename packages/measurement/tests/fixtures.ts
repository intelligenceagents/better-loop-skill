import { readFileSync } from "node:fs";
import type {
  EvaluationDraft, EvaluationRun, MeasurementOptions, MeasurementResult, QualityRule, RegistrationEvidence,
  TaskContext, TelemetryEntry, TelemetryLedger,
} from "../src/index.js";
import { freezeProtocol, planFromRecord } from "../src/index.js";

/** All numbers in this test module are invented, including tests exercising production-origin branches. */
export function draft(): EvaluationDraft {
  return JSON.parse(readFileSync(new URL("../../../evals/measurement/synthetic-draft.json", import.meta.url), "utf8")) as EvaluationDraft;
}
export function measured(result: MeasurementResult): Extract<MeasurementResult, { valid: true }> {
  if (!result.valid) throw new Error(JSON.stringify(result.errors));
  return result;
}
export function rejected(result: MeasurementResult): string[] {
  if (result.valid) throw new Error("Expected rejection");
  return result.errors.map(error => error.code);
}
export const qualityRule: QualityRule = {
  version: "invented-checks-0.1",
  dimensions: [{ id: "acceptance", minimum: 0, maximum: 1, floor: 1, max_regression: 0 }],
};
export function context(record: EvaluationDraft, side: "baseline" | "candidate" = "baseline"): TaskContext {
  return {
    task: structuredClone(record.task), input_version: record.task_instance_id,
    equivalence_group: "invented-equivalent-diagnostic-tasks",
    acceptance_criteria_version: "invented-fixed-checks-0.1",
    evaluator_version: record.protocol.evaluator_version, metric_definition_version: record.protocol.metric_definition_version,
    metric_unit: record.protocol.primary_metric === "model_tokens" ? "count" :
      record.protocol.primary_metric === "estimated_api_cost" ? "USD" :
        record.protocol.primary_metric === "quality_rubric" ? "index" :
          record.protocol.primary_metric === "rework_cycles" ? "count" : "seconds",
    resource_conditions: "invented-isolated-identical-tools",
    conditions: structuredClone(record.conditions[side]),
  };
}
export function entry(tokens: number | null = 1000): TelemetryEntry {
  return {
    id: "invented-disjoint-parent-event", role: "parent", input_token_semantics: "includes_cache",
    input_tokens: tokens === null ? null : tokens * 0.8, output_tokens: tokens === null ? null : tokens * 0.2,
    cache_read_tokens: tokens === null ? null : 0, cache_write_tokens: tokens === null ? null : 0,
    model_duration_seconds: null, human_effort_seconds: null, actual_billing_usd: null, estimated_api_cost_usd: null,
  };
}
export function ledger(tokens: number | null = 1000): TelemetryLedger {
  return {
    coverage: { parent: "complete", worker: "not_applicable", judge: "not_applicable", retry: "not_applicable", orchestration: "not_applicable" },
    entries: [entry(tokens)],
  };
}
export function prepare(record: EvaluationDraft = draft()): { draft: EvaluationDraft; options: MeasurementOptions } {
  record.protocol.resource_budget.max_duration_seconds = null;
  record.trials.forEach((trial, index) => {
    const first = Date.UTC(2020, 0, 1, 0, index, 1);
    const b = first + (trial.order === "baseline_first" ? 0 : 2000);
    const c = first + (trial.order === "baseline_first" ? 2000 : 0);
    trial.baseline.started_at = new Date(b).toISOString(); trial.baseline.finished_at = new Date(b + 1000).toISOString();
    trial.candidate.started_at = new Date(c).toISOString(); trial.candidate.finished_at = new Date(c + 1000).toISOString();
  });
  const evidence: RegistrationEvidence = {
    registered_at: "2020-01-01T00:00:00Z",
    baseline: context(record), candidate: context(record, "candidate"), allowed_condition_changes: ["skill_version"],
    quality_rule: structuredClone(qualityRule), task_fingerprint: `invented-inputs:${record.task_instance_id}`,
    independent_pairs: true,
    trial_plan: record.trials.map(trial => ({
      pair_id: trial.pair_id, order: trial.order, seed: trial.seed,
      blind_assignment: trial.order === "baseline_first" ? "candidate_as_A" : "baseline_as_A",
    })),
  };
  const options: MeasurementOptions = {
    registration: freezeProtocol(planFromRecord(record), evidence),
    quality: Object.fromEntries(record.trials.map(trial => [trial.pair_id, { baseline: { acceptance: 1 }, candidate: { acceptance: 1 } }])),
    telemetry: Object.fromEntries(record.trials.map(trial => {
      const baseline = ledger(trial.baseline.metrics.model_tokens); const candidate = ledger(trial.candidate.metrics.model_tokens);
      baseline.entries[0]!.id = `invented-${trial.pair_id}-baseline`; candidate.entries[0]!.id = `invented-${trial.pair_id}-candidate`;
      return [trial.pair_id, { baseline, candidate }];
    })),
  };
  return { draft: record, options };
}
export function refreeze(record: EvaluationDraft, options: MeasurementOptions): void {
  const evidence = structuredClone(options.registration!.evidence);
  evidence.baseline = context(record); evidence.candidate = context(record, "candidate");
  options.registration = freezeProtocol(planFromRecord(record), evidence);
}
export function withoutSummary(record: EvaluationRun): EvaluationDraft {
  const { summary: _summary, ...rest } = record;
  return rest;
}
