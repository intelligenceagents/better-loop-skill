import type { EvaluationRun } from "./evaluation-run.js";

export type { EvaluationRun };
export type EvaluationDraft = Omit<EvaluationRun, "summary">;
export type ProtocolPlan = Omit<EvaluationDraft, "observations" | "trials">;
export type Task = EvaluationRun["task"];
export type Conditions = EvaluationRun["conditions"]["baseline"];
export type Metric = EvaluationRun["protocol"]["primary_metric"];
export type Outcome = EvaluationRun["summary"]["outcome"];
export type Direction = EvaluationRun["protocol"]["direction"];
export type Trial = EvaluationRun["trials"][number];
export type Arm = Trial["baseline"];
export type ConditionChange = keyof Conditions;
export type MetricUnit = "count" | "seconds" | "USD" | "index" | "percent" | "proportion";

export interface TaskContext {
  task: Task;
  input_version: string;
  /** An explicit equivalence assertion, not an inferred similarity score. */
  equivalence_group: string | null;
  acceptance_criteria_version: string;
  evaluator_version: string;
  metric_definition_version: string;
  metric_unit: MetricUnit;
  resource_conditions: string;
  conditions: Conditions;
}

export interface Compatibility {
  similarity: "same_taxonomy" | "different_taxonomy";
  status: "comparable" | "not_comparable" | "unknown";
  reasons: string[];
}

export interface QualityDimension {
  id: string;
  minimum: number;
  maximum: number;
  floor: number;
  /** null means non-critical; otherwise a maximum permitted baseline-to-candidate drop. */
  max_regression: number | null;
}
export interface QualityRule { version: string; dimensions: QualityDimension[] }
export type QualityScores = Record<string, number | null>;
export interface PairQualityScores { baseline: QualityScores; candidate: QualityScores }
export interface QualityAssessment {
  baseline_floor_passed: boolean | null;
  quality_floor_passed: boolean | null;
  critical_regression: boolean | null;
  reasons: string[];
}

export interface RegistrationEvidence {
  registered_at: string;
  baseline: TaskContext;
  candidate: TaskContext;
  allowed_condition_changes: ConditionChange[];
  quality_rule: QualityRule;
  /** Caller-provided identity of task inputs. Never upload a private-input fingerprint. */
  task_fingerprint: string;
  independent_pairs: boolean;
  trial_plan: {
    pair_id: string;
    order: Trial["order"];
    seed: number | null;
    blind_assignment: "baseline_as_A" | "candidate_as_A";
  }[];
}
export interface FrozenProtocol {
  version: "bl-measurement-registration-0.1";
  plan: ProtocolPlan;
  evidence: RegistrationEvidence;
  digest: string;
}

export const TELEMETRY_ROLES = ["parent", "worker", "judge", "retry", "orchestration"] as const;
export type TelemetryRole = typeof TELEMETRY_ROLES[number];
export type Coverage = "complete" | "missing" | "not_applicable";
export interface TelemetryEntry {
  id: string;
  role: TelemetryRole;
  input_token_semantics: "includes_cache" | "excludes_cache" | "unknown";
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  model_duration_seconds: number | null;
  human_effort_seconds: number | null;
  actual_billing_usd: number | null;
  estimated_api_cost_usd: number | null;
}
export interface TelemetryLedger {
  coverage: Record<TelemetryRole, Coverage>;
  entries: TelemetryEntry[];
}
export interface AccountedValue {
  total: number | null;
  known_subtotal: number;
  complete: boolean;
}
export interface TelemetryAccounting {
  model_tokens: AccountedValue;
  cache_read_tokens: AccountedValue;
  cache_write_tokens: AccountedValue;
  model_duration_seconds: AccountedValue;
  human_effort_seconds: AccountedValue;
  actual_billing_usd: AccountedValue;
  estimated_api_cost_usd: AccountedValue;
  reasons: string[];
}

export interface PairDelta {
  baseline: number | null;
  candidate: number | null;
  absolute_change: number | null;
  favorable_absolute_change: number | null;
  relative_change_percent: number | null;
  percentage_point_change: number | null;
  baseline_index: 100 | null;
  candidate_index: number | null;
  index_rounding: "nearest_5_points";
  reason: "missing_value" | "zero_baseline" | "numeric_overflow" | "pair_not_completed" | null;
}
export interface PairMeasurement {
  pair_id: string;
  baseline_status: Arm["status"];
  candidate_status: Arm["status"];
  delta: PairDelta;
  outcome: Outcome;
  reasons: string[];
}
export interface Uncertainty {
  method: "exact_sign_median_interval";
  confidence_level: 0.95;
  observed_pair_count: number;
  median_relative_change_percent: number | null;
  observed_range_percent: [number, number] | null;
  interval_percent: [number, number] | null;
  interval_coverage: number | null;
  unavailable_reason: string | null;
  assumptions: string[];
}
export interface MeasurementReport {
  version: "bl-measurement-0.1";
  run_id: string;
  task_instance_id: string;
  evidence_track: EvaluationRun["protocol"]["kind"];
  content_origin: EvaluationRun["content_origin"];
  execution_claim: "invented_fixture" | "reported_host_execution" | "reported_private_work" | "no_execution_reported";
  outcome: Outcome;
  pairs: PairMeasurement[];
  counts: Record<Outcome, number>;
  mean_relative_change_percent: number | null;
  mean_absolute_change: number | null;
  uncertainty: Uncertainty;
  eligibility: {
    preliminary_measured_improvement: boolean;
    actual_benchmark_evidence: boolean;
    /** This task engine never establishes human attribution or population sampling. */
    human_achievement_evidence: false;
    population_cohort_evidence: false;
    reasons: string[];
  };
  telemetry: {
    pairs: { pair_id: string; baseline: TelemetryAccounting; candidate: TelemetryAccounting }[];
    shared_overhead: TelemetryAccounting | null;
  };
  registration_verified: boolean;
  compatibility: Compatibility;
  limitations: string[];
}
export interface MeasurementOptions {
  registration?: FrozenProtocol;
  quality?: Record<string, PairQualityScores>;
  telemetry?: Record<string, { baseline: TelemetryLedger; candidate: TelemetryLedger }>;
  /** Disjoint protocol-wide work whose true per-arm attribution is unavailable; never arbitrarily split. */
  shared_telemetry?: TelemetryLedger;
}
export interface MeasurementIssue { code: string; path: string }
export type MeasurementResult =
  | { valid: true; record: EvaluationRun; report: MeasurementReport }
  | { valid: false; errors: MeasurementIssue[] };
export interface EvaluationInput { record: unknown; options?: MeasurementOptions }
export interface RepeatedMilestone {
  eligible: boolean;
  minimum_distinct_tasks: 3;
  minimum_pairs_per_task: 5;
  qualifying_task_ids: string[];
  excluded: { run_id: string; reasons: string[] }[];
  reasons: string[];
  claim: "controlled_task_improvement" | "observational_followup" | null;
}
