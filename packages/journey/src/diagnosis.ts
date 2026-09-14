import { auditSkill, DOMAIN_CHECKS, INDICATORS, METHODOLOGY_VERSION, unknownMetrics } from "@better-loop/core";
import type { TaskContext } from "@better-loop/core";
import { LIMITS } from "./types.js";

export const DELTA_REPORT_VERSION = "bl-delta-report-0.1" as const;
export type RecommendationOutcomeStatus = "not_tried" | "declined" | "helped" | "did_not_help" | "inconclusive";
export interface FollowupCheck {
  content_origin: "work_derived" | "synthetic";
  change: "followup" | "revision_only" | "copy" | "unknown";
  comparison: "comparable" | "not_comparable" | "unknown";
  outcome: "improved" | "no_change" | "regressed" | "mixed" | "not_measured" | "insufficient_evidence";
  quality_floor: "met" | "not_met" | "unknown";
  critical_regression: "none_observed" | "observed" | "unknown";
  check_result: "met" | "not_met" | "unknown";
}
export interface RecommendationOutcome {
  recommendation_id: string;
  status: RecommendationOutcomeStatus;
  note: string;
  recorded_at: string;
  provenance: "explicit_user_report";
  sequence: number;
  reflection_completed: boolean;
  content_origin: "work_derived" | "synthetic" | "unknown";
  check: FollowupCheck | null;
  context?: {
    recommendation_key: string;
    observed_assessment_id: string;
    evidence_digest: string;
    evidence_kind: "repository_snapshot" | "selected_check";
    first_observed_sequence: number;
    reflection_sequence: number | null;
  };
}
export interface DeltaArtifact {
  id: string;
  path: string;
  status: "added" | "modified" | "deleted" | "unavailable";
  before: string | null;
  after: string | null;
}
export interface DeltaRecommendation {
  code: string;
  diagnosis: string;
  action: string;
  acceptance_check: string;
  evidence_refs: string[];
  outcome: "unmeasured";
}
export interface DeltaReport {
  schema_version: typeof DELTA_REPORT_VERSION;
  framework_version: typeof METHODOLOGY_VERSION;
  classification: "private_local_journey_not_export";
  method: "deterministic_artifact_diagnosis";
  mode: "baseline" | "delta" | "invalidated";
  recommendation: DeltaRecommendation;
  prior_context: { recommendation: string; user_outcome: RecommendationOutcome | null } | null;
  human_observations: { indicator: string; state: "insufficient_evidence"; actor: "unknown"; rating: null }[];
  metrics: ReturnType<typeof unknownMetrics>;
  measured_improvement: null;
  limitations: string[];
}

/** Selected repository artifacts are data, not conversation or proof of human judgment. */
export function diagnoseDelta(input: {
  task: TaskContext;
  mode: DeltaReport["mode"];
  artifacts: DeltaArtifact[];
  prior?: { recommendation: DeltaRecommendation; outcome: RecommendationOutcome | null };
}): DeltaReport {
  const domain = DOMAIN_CHECKS[input.task.family];
  if (!domain || input.artifacts.length > LIMITS.repositories * LIMITS.filesPerRepository * 2) throw new Error("invalid_delta_input");
  let recommendation: DeltaRecommendation = {
    code: "missing_executed_acceptance_evidence",
    diagnosis: "The selected artifact changes do not establish whether the task's acceptance checks passed.",
    action: "Review the changed behavior against the selected acceptance criteria and retain the actual check outcome locally.",
    acceptance_check: input.task.acceptance_criteria.length
      ? `Check the selected criterion: ${input.task.acceptance_criteria[0]}. Retain failures and unknowns as well as passes.`
      : domain.check,
    evidence_refs: input.artifacts.slice(0, 3).map(item => item.id), outcome: "unmeasured",
  };
  if (!input.artifacts.length) recommendation = {
    code: "no_selected_text_evidence", diagnosis: "No eligible tracked text evidence was available in this selection.",
    action: "Review the selected scope and exclusion counts; choose relevant authorized evidence without relaxing credential exclusions.",
    acceptance_check: "Confirm that the selection contains the intended task evidence. Missing evidence remains unknown.",
    evidence_refs: [], outcome: "unmeasured",
  };
  else if (!input.task.acceptance_criteria.length) recommendation = {
    code: "missing_acceptance_criteria", diagnosis: "No acceptance criteria were supplied for this journey.",
    action: domain.change, acceptance_check: domain.check,
    evidence_refs: [], outcome: "unmeasured",
  };
  const priority = ["implicit_publication", "unbounded_evidence", "unbounded_execution", "unsupported_guarantee",
    "conflicting_interaction", "broad_trigger", "missing_trigger", "missing_acceptance", "context_review"];
  const findings = input.artifacts.flatMap(artifact => {
    if (!/(?:^|\/)(?:SKILL|AGENTS|CLAUDE)\.md$/i.test(artifact.path) || artifact.after === null) return [];
    // Repository instructions have no skill frontmatter/activation contract.
    const isSkill = /(?:^|\/)SKILL\.md$/i.test(artifact.path);
    const applicable = (text: string) => auditSkill(text).findings.filter(item =>
      isSkill || !["missing_trigger", "broad_trigger"].includes(item.code));
    const priorCodes = new Set(artifact.before === null ? [] : applicable(artifact.before).map(item => item.code));
    return applicable(artifact.after).filter(item => !priorCodes.has(item.code)).map(item => ({ artifact, item }));
  }).sort((a, b) => priority.indexOf(a.item.code) - priority.indexOf(b.item.code));
  const strongest = findings[0];
  if (strongest) recommendation = {
    code: `instruction_${strongest.item.code}`,
    diagnosis: `A ${input.mode === "delta" ? "new " : ""}static instruction hypothesis in ${strongest.artifact.path}:${strongest.item.line} (${strongest.artifact.id}): ${strongest.item.hypothesis}`,
    action: strongest.item.suggestion,
    acceptance_check: `In a separately authorized host check, verify both: ${strongest.item.positive_case} / ${strongest.item.should_not_trigger_case}`,
    evidence_refs: [strongest.artifact.id], outcome: "unmeasured",
  };
  if (input.prior?.recommendation.code === recommendation.code &&
      ["declined", "did_not_help"].includes(input.prior.outcome?.status ?? "")) {
    recommendation = {
      code: "reconsider_previous_recommendation",
      diagnosis: "The user reported declining or not benefiting from the previous recommendation. Its benefit remains unestablished.",
      action: "Use the user's stated reason to choose a smaller alternative check or revise the task criteria; do not repeat the declined change automatically.",
      acceptance_check: "Agree on one observable result for the alternative and ask for its outcome only after the user tries it.",
      evidence_refs: [], outcome: "unmeasured",
    };
  }
  return {
    schema_version: DELTA_REPORT_VERSION, framework_version: METHODOLOGY_VERSION,
    classification: "private_local_journey_not_export", method: "deterministic_artifact_diagnosis",
    mode: input.mode, recommendation,
    prior_context: input.prior ? {
      recommendation: input.prior.recommendation.action.slice(0, 1200),
      user_outcome: input.prior.outcome ? structuredClone(input.prior.outcome) : null,
    } : null,
    human_observations: Object.keys(INDICATORS).map(indicator => ({
      indicator, state: "insufficient_evidence", actor: "unknown", rating: null,
    })),
    metrics: unknownMetrics(), measured_improvement: null,
    limitations: [
      "Tracked artifacts and Git authors do not establish human judgment, executed tests, task quality, or resource usage.",
      "Static instruction findings are hypotheses. Existing findings are not reclassified as newly introduced merely because line numbers changed.",
      "A user-reported recommendation outcome is not a measured causal improvement, benchmark result, achievement, or candidate ranking.",
      "Only the selected bounded text changes were considered. Excluded, untracked, binary and oversized evidence remains unavailable.",
      "Host semantic reasoning is separate from this deterministic report and uses the configured model provider when explicitly requested.",
      "Paths, hashes, raw source, state and this report remain local; this object is not a public share candidate.",
    ],
  };
}
