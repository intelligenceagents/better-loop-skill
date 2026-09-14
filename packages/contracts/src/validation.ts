import shareSchema from "./generated/share-candidate.cjs";
import evaluationSchema from "./generated/evaluation-run.cjs";
import type { ValidateFunction } from "ajv";
import { canonicalize } from "./canonicalize.js";
import type { ShareCandidate } from "./generated/share-candidate.js";
import type { EvaluationRun } from "./generated/evaluation-run.js";

export type { ShareCandidate, EvaluationRun };
export interface ValidationIssue {
  /** Fixed contract location, never an arbitrary input key or input value. */
  readonly path: string;
  readonly code: string;
}
export type ValidationResult<T> =
  | { readonly valid: true; readonly data: T; readonly errors: readonly [] }
  | { readonly valid: false; readonly errors: readonly ValidationIssue[] };

function reject(code: string, path = ""): ValidationIssue { return { path, code }; }

function structure<T>(input: unknown, validator: ValidateFunction): ValidationResult<T> {
  try {
    // Reject JavaScript-only values before AJV can coerce, invoke a getter, or
    // overlook a property. Return a detached JSON snapshot for digest callers.
    const data: unknown = JSON.parse(canonicalize(input));
    if (!validator(data)) {
      // Do not emit AJV params/messages: extra property names can contain PII.
      return { valid: false, errors: (validator.errors ?? []).map(error => reject(`schema_${error.keyword}`)) };
    }
    return { valid: true, data: data as T, errors: [] };
  } catch {
    return { valid: false, errors: [reject("invalid_json_value")] };
  }
}

export function validateShareCandidate(input: unknown): ValidationResult<ShareCandidate> {
  const result = structure<ShareCandidate>(input, shareSchema);
  if (!result.valid) return result;
  const data = result.data;
  const errors: ValidationIssue[] = [];
  if (new TextEncoder().encode(canonicalize(data)).byteLength > 16384) {
    errors.push(reject("candidate_too_large"));
  }
  if (new Set(data.human_behaviors.map(item => item.indicator)).size !== data.human_behaviors.length) {
    errors.push(reject("duplicate_indicator", "/human_behaviors"));
  }
  if (new Set(data.kpis.map(item => item.metric)).size !== data.kpis.length) {
    errors.push(reject("duplicate_metric", "/kpis"));
  }
  if (data.outcome === "improved") {
    const primary = data.kpis[0]!;
    const favorable = primary.direction === "lower_is_better" ? primary.candidate_index < 100 : primary.candidate_index > 100;
    if (!favorable) errors.push(reject("unfavorable_primary_kpi", "/kpis/0"));
  }
  return errors.length ? { valid: false, errors } : result;
}

function isClose(actual: number, reported: number): boolean {
  // Python math.isclose default rel_tol=1e-9, abs_tol=1e-6.
  return Number.isFinite(actual) &&
    Math.abs(reported - actual) <= Math.max(1e-6, 1e-9 * Math.max(Math.abs(actual), Math.abs(reported)));
}

export function validateEvaluationRun(input: unknown): ValidationResult<EvaluationRun> {
  const result = structure<EvaluationRun>(input, evaluationSchema);
  if (!result.valid) return result;
  const data = result.data;
  const { protocol, trials, summary } = data;
  const errors: ValidationIssue[] = [];
  const ids = new Set(trials.map(trial => trial.pair_id));
  if (ids.size !== trials.length || ids.size !== protocol.planned_pair_ids.length ||
      !protocol.planned_pair_ids.every(id => ids.has(id))) {
    errors.push(reject("planned_pairs_mismatch", "/trials"));
  }
  const changes = summary.paired_relative_changes_percent;
  if (changes.length !== trials.length) {
    errors.push(reject("pair_changes_length_mismatch", "/summary/paired_relative_changes_percent"));
    return { valid: false, errors };
  }
  const metric = protocol.primary_metric;
  const expectedDirection = metric === "quality_rubric" ? "higher_is_better" : "lower_is_better";
  if (protocol.direction !== expectedDirection) errors.push(reject("metric_direction_mismatch", "/protocol/direction"));
  trials.forEach((trial, index) => {
    const before = trial.baseline;
    const after = trial.candidate;
    const b = before.metrics[metric];
    const a = after.metrics[metric];
    const reported = changes[index]!;
    const usable = before.status === "completed" && after.status === "completed" && b !== null && a !== null && b > 0;
    const path = `/summary/paired_relative_changes_percent/${index}`;
    if (!usable) {
      if (reported !== null) errors.push(reject("unavailable_relative_change", path));
      return;
    }
    const actual = 100 * (expectedDirection === "lower_is_better" ? b - a : a - b) / b;
    if (reported === null || !isClose(actual, reported)) errors.push(reject("relative_change_mismatch", path));
  });
  if (summary.outcome === "improved") {
    const complete = changes.every(value => value !== null);
    const quality = trials.every(trial => trial.candidate.quality_floor_passed === true && trial.candidate.critical_regression === false);
    const mean = changes.reduce<number>((sum, value) => sum + (value ?? 0), 0) / changes.length;
    if (!(complete && quality && mean > 0 && protocol.compatibility === "comparable")) {
      errors.push(reject("unsupported_improvement", "/summary/outcome"));
    }
    if (protocol.kind === "controlled_paired" && !protocol.frozen_before_execution) {
      errors.push(reject("unfrozen_controlled_protocol", "/protocol/frozen_before_execution"));
    }
  }
  return errors.length ? { valid: false, errors } : result;
}
