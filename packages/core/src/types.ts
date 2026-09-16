export const LOCAL_VERSION = "bl-local-0.2" as const;
export const METHODOLOGY_VERSION = "better-loop-fluency-0.1" as const;
export const TASK_FAMILIES = [
  "software", "analysis_finance", "research_strategy", "mathematics_science",
  "writing_design", "operations_education", "general",
] as const;
export type TaskFamily = typeof TASK_FAMILIES[number];
export const INDICATORS = {
  goal_definition: "Delegation",
  approach_consultation: "Delegation",
  iterative_refinement: "Description",
  quality_examples: "Description",
  output_structure: "Description",
  collaboration_mode: "Description",
  tone_preferences: "Description",
  audience_definition: "Description",
  context_gap_detection: "Discernment",
  reasoning_scrutiny: "Discernment",
  factual_verification: "Discernment",
} as const;
export type IndicatorId = keyof typeof INDICATORS;
export const ACTORS = ["human", "agent", "tool", "reviewer", "unknown"] as const;
export type Actor = typeof ACTORS[number];
export const CHANNELS = ["conversation", "tool_result", "review", "artifact"] as const;
export type Channel = typeof CHANNELS[number];
export type Host = "claude_code" | "codex";
export type ObservationState = "observed" | "not_observed" | "not_applicable" | "insufficient_evidence";

/** User-selected context, never inferred from employer, directory, or identity. */
export interface TaskContext {
  family: TaskFamily;
  goal: string;
  acceptance_criteria: string[];
  not_applicable?: Partial<Record<IndicatorId, string>>;
}
export interface EvidenceRecord {
  id: string;
  actor: Actor;
  channel: Channel;
  text: string;
}
export interface NormalizedTask {
  schema_version: typeof LOCAL_VERSION;
  host: Host;
  source_format: "selected-export-v1" | "claude-code-jsonl" | "codex-jsonl";
  task: TaskContext;
  records: EvidenceRecord[];
  coverage: "selected_complete" | "partial";
  limitations: string[];
  metrics: LocalMetrics;
}
export interface LocalMetrics {
  total_model_tokens: number | null;
  model_time_ms: number | null;
  human_effort_minutes: number | null;
  cash_cost: number | null;
  estimated_api_cost: number | null;
  quality: number | null;
}
export const unknownMetrics = (): LocalMetrics => ({
  total_model_tokens: null, model_time_ms: null, human_effort_minutes: null,
  cash_cost: null, estimated_api_cost: null, quality: null,
});
export interface Observation {
  indicator_id: IndicatorId;
  competency: typeof INDICATORS[IndicatorId];
  state: ObservationState;
  human_state: ObservationState;
  actor: Actor;
  channel: Channel | null;
  evidence_refs: string[];
  rating: null;
  description: string;
  limitations: string[];
}
export interface Recommendation {
  change: string;
  evidence_refs: string[];
  basis: string;
  expected_benefit: string;
  validation: string;
}
export interface PrivateReport {
  schema_version: "bl-report-0.2";
  methodology_version: typeof METHODOLOGY_VERSION;
  classification: "private_local_report_not_share_candidate";
  conclusion: string;
  scope: {
    host: Host;
    source_format: NormalizedTask["source_format"];
    task: TaskContext;
    coverage: NormalizedTask["coverage"];
    evidence_count: number;
    missing_evidence: string[];
  };
  observations: Observation[];
  what_worked: Observation[];
  changes: Recommendation[];
  metrics: LocalMetrics;
  outcome: "unknown";
  comparison: "not_evaluated";
  next_experiment: { action: string; check: string; resource_estimate: null };
  limitations: string[];
  evidence: EvidenceRecord[];
}
