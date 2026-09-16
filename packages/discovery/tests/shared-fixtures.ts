/**
 * ISOLATED SOFTWARE TEST DATA ONLY. All owner IDs, evidence, measurements and opt-ins are
 * invented branch inputs. Nothing here is a real task, public participant or challenge result.
 */
import type { SharedLearningQuery } from "../src/learning.js";
import type { SharedProgressQuery, SharedSignalRecord } from "../src/signals.js";
import type { Task } from "../src/types.js";
import { row } from "./fixtures.js";

export const families = ["software", "analysis_finance", "research_strategy", "mathematics_science", "writing_design", "operations_education", "general"] as const;
export const problems = ["diagnosing_error", "reconciling_data", "synthesizing_evidence", "quantitative_reasoning", "creating_content", "coordinating_plan", "extracting_information", "improving_process"] as const;
export const objectives = ["correctness", "less_rework", "lower_resource_use", "clearer_communication", "useful_alternatives", "reproducibility"] as const;
export const actions = ["goal_definition", "approach_consultation", "iterative_refinement", "quality_examples", "output_structure",
  "collaboration_mode", "tone_preferences", "audience_definition", "context_gap_detection", "reasoning_scrutiny", "factual_verification"] as const;
export const qualityDimensions = ["correctness", "completeness", "reasoning", "verification", "reproducibility", "communication", "constraint_compliance"] as const;

export function sharedRow(index = 1, candidateIndex = 100): SharedSignalRecord {
  const record = row(index, candidateIndex);
  record.consent!.community_learning = true;
  record.consent!.candidate_discovery = false;
  record.capability_evidence!.benchmark = null;
  return { ...record, server_owner_id: `TEST_ONLY_SHARED_OWNER_${index}` };
}
export function publicSharedRow(index = 1, candidateIndex = 100) {
  const { server_owner_id: _owner, ...record } = sharedRow(index, candidateIndex);
  return record;
}
export const sharedRows = (count = 20): SharedSignalRecord[] => Array.from({ length: count }, (_, i) => sharedRow(i + 1));
export function sharedQuery(family: Task["task_family"] = "software"): SharedProgressQuery {
  return {
    version: "bl-shared-progress-query-0.1",
    framework_version: "better-loop-fluency-0.1", rubric_id: "bl-work-evidence-0.1", metric_definition_version: "bl-metrics-0.1",
    task: {
      task_family: family, problem_type: "diagnosing_error", objective: "correctness",
      difficulty: "moderate", difficulty_basis: "rubric_estimated",
      constraints: ["source_required", "tool_limited", "format_required", "fixed_inputs"], task_contract_version: "bl-task-0.1",
    },
    conditions: { baseline: { platform: "claude_code", model_tier: "standard" }, candidate: { platform: "claude_code", model_tier: "standard" } },
    comparison: "controlled_paired", metric: "model_tokens", direction: "lower_is_better", metric_provenance: "self_reported",
    server_trust_tier: "self_reported", required_quality_dimensions: ["correctness"],
    quality_evaluator: "tool", quality_basis: "locally_recorded",
  };
}
export function learningQuery(): SharedLearningQuery {
  return { task_family: "software", problem_type: "diagnosing_error", objective: "correctness", difficulty: "moderate" };
}
