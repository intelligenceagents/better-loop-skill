/**
 * PURE CORRECTNESS TEST FIXTURES ONLY. Every ID, consent flag, measurement and work_derived
 * claim below is invented to exercise branches. These are never benchmark runs or product data.
 */
import type { BenchmarkCohortQuery, BenchmarkCohortRecord, DiscoveryContext, LocalMilestoneEvent, PublicEvidenceRecord, RoleCriteria } from "../src/types.js";

export const current: DiscoveryContext = { source: "current_server_snapshot", complete: true };
export const criteria = (): RoleCriteria => ({
  task_families: ["software"], problem_types: ["diagnosing_error"], objectives: ["correctness"],
  required_skills: ["factual_verification", "domain_validation"],
  required_quality_checks: ["correctness", "reasoning"], required_human_actions: ["factual_verification"], difficulty: "moderate",
});
export function row(index = 1, candidateIndex = 100): PublicEvidenceRecord {
  return {
    public_id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
    current: true, status: "published", server_trust_tier: "self_reported",
    consent: { public_story: true, benchmark_aggregation: true, candidate_discovery: true,
      community_learning: false, policy_version: "bl-sharing-0.2" },
    capability_evidence: {
      schema_version: "bl-capability-evidence-0.1", rubric_id: "bl-work-evidence-0.1",
      assessment_basis: "conversation_and_artifacts", human_involvement: "mixed",
      human_actions: [{ action: "factual_verification", evidence: "selected_human_message", outcome_check: "met" }],
      quality_checks: [{ dimension: "correctness", result: "met", evaluator: "tool", basis: "locally_recorded" }],
      change: "followup", distinct_task_band: "one",
      benchmark: { id: "bl-public-approval-binding", version: "0.1", basis: "self_reported", result: "met" },
    },
    candidate: {
      schema_version: "0.1.0", framework_version: "better-loop-fluency-0.1", content_origin: "work_derived",
      task: {
        task_family: "software", problem_type: "diagnosing_error", objective: "correctness",
        difficulty: "moderate", difficulty_basis: "rubric_estimated",
        constraints: ["source_required", "tool_limited", "format_required", "fixed_inputs"],
        demonstrated_skills: ["factual_verification"], task_contract_version: "bl-task-0.1", benchmark_contract: "unregistered",
      },
      conditions: { baseline: { platform: "claude_code", model_tier: "standard" }, candidate: { platform: "claude_code", model_tier: "standard" } },
      interventions: ["acceptance_checks"],
      human_behaviors: [{ indicator: "factual_verification", state: "observed", rating: "effective", evidence_summary: "Invented selected human check for a pure software test." }],
      story: {
        title: "TEST FIXTURE only", problem: "Invented correctness input.", change: "An invented acceptance check.",
        result: "Fictional normalized index for arithmetic checks.", lesson: "Retain negative findings.",
        limits: "All claims, indices and opt-ins here are fictional test inputs, never real execution evidence.",
      },
      outcome: candidateIndex < 100 ? "improved" : candidateIndex === 100 ? "no_change" : "regressed",
      evidence: {
        comparison: "controlled_paired", compatibility: "comparable", quality_floor: "met",
        critical_regression: "none_observed", trial_count_band: "five_to_nine", coverage: "moderate",
      },
      kpis: [{ metric: "model_tokens", direction: "lower_is_better", baseline_index: 100,
        candidate_index: candidateIndex, precision: "rounded_to_5_index_points", provenance: "self_reported", metric_definition_version: "bl-metrics-0.1" }],
    },
  };
}
/** Legitimate self-attestation fixture: no observed conversation or ordinal human rating is invented. */
export function attestedRow(index = 1, state: "insufficient_evidence" | "not_observed" = "insufficient_evidence"): PublicEvidenceRecord {
  const record = row(index);
  record.candidate.human_behaviors[0]!.state = state;
  record.candidate.human_behaviors[0]!.rating = null;
  record.candidate.human_behaviors[0]!.evidence_summary = "Invented attestation only; no selected human message was observed.";
  record.capability_evidence!.assessment_basis = "user_attestation";
  record.capability_evidence!.human_involvement = "human_directed";
  record.capability_evidence!.human_actions[0]!.evidence = "user_attestation";
  record.capability_evidence!.quality_checks[0]!.basis = "self_reported";
  record.capability_evidence!.quality_checks[0]!.evaluator = "human";
  return record;
}
export const cohortRow = (index = 1, candidateIndex = 100): BenchmarkCohortRecord => ({
  ...row(index, candidateIndex), server_owner_id: `TEST_ONLY_OWNER_${index}`, benchmark_conditions_version: "bl-approval-binding-readonly-0.1",
});
export function cohortQuery(): BenchmarkCohortQuery {
  const candidate = row().candidate;
  const { demonstrated_skills: _skills, benchmark_contract: _benchmark, ...task } = candidate.task;
  return {
    benchmark_id: "bl-public-approval-binding", benchmark_version: "0.1",
    benchmark_conditions_version: "bl-approval-binding-readonly-0.1", framework_version: "better-loop-fluency-0.1",
    rubric_id: "bl-work-evidence-0.1", task, conditions: candidate.conditions, comparison: "controlled_paired",
    metric: "model_tokens", metric_definition_version: "bl-metrics-0.1", direction: "lower_is_better",
    metric_provenance: "self_reported", server_trust_tier: "self_reported", benchmark_basis: "self_reported",
  };
}
export const cohort = (count = 20): BenchmarkCohortRecord[] => Array.from({ length: count }, (_, index) => cohortRow(index + 1));
export function reflection(): LocalMilestoneEvent {
  return {
    task_key: "TEST_ONLY_TASK", equivalence_key: "TEST_ONLY_EQUIVALENCE", sequence: 1, kind: "reflection",
    content_origin: "work_derived", change: "initial", reflection_completed: true, evidence_available: true,
    comparison: "unknown", outcome: "not_measured", quality_floor: "unknown", critical_regression: "unknown",
  };
}
export function followup(): LocalMilestoneEvent {
  return { ...reflection(), sequence: 2, kind: "followup", change: "followup", reflection_completed: false,
    comparison: "comparable", outcome: "regressed", quality_floor: "met", critical_regression: "none_observed" };
}
