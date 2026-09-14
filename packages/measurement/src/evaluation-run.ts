/* Generated from the draft schema. Runtime validation is required. */

/**
 * Private local record. Never submit this to the public service. Synthetic examples are not evidence of efficacy.
 */
export interface EvaluationRun {
  schema_version: "0.1.0";
  framework_version: "better-loop-fluency-0.1";
  content_origin: "synthetic" | "public_benchmark" | "private_work";
  run_id: string;
  task_instance_id: string;
  task: {
    task_family:
      | "software"
      | "analysis_finance"
      | "research_strategy"
      | "mathematics_science"
      | "writing_design"
      | "operations_education"
      | "general";
    problem_type:
      | "diagnosing_error"
      | "reconciling_data"
      | "synthesizing_evidence"
      | "quantitative_reasoning"
      | "creating_content"
      | "coordinating_plan"
      | "extracting_information"
      | "improving_process";
    objective:
      | "correctness"
      | "less_rework"
      | "lower_resource_use"
      | "clearer_communication"
      | "useful_alternatives"
      | "reproducibility";
    difficulty: "routine" | "moderate" | "complex" | "unknown";
    difficulty_basis: "self_estimated" | "rubric_estimated" | "unknown";
    /**
     * @minItems 0
     * @maxItems 6
     */
    constraints: (
      "source_required" | "time_bounded" | "tool_limited" | "format_required" | "quality_threshold" | "fixed_inputs"
    )[];
    /**
     * @minItems 0
     * @maxItems 8
     */
    demonstrated_skills: (
      | "goal_definition"
      | "approach_consultation"
      | "iterative_refinement"
      | "quality_examples"
      | "output_structure"
      | "collaboration_mode"
      | "tone_preferences"
      | "audience_definition"
      | "context_gap_detection"
      | "reasoning_scrutiny"
      | "factual_verification"
      | "task_decomposition"
      | "tool_selection"
      | "domain_validation"
      | "useful_alternatives"
      | "learning_transfer"
    )[];
    task_contract_version: "bl-task-0.1";
    benchmark_contract:
      "unregistered" | "synthetic-code-checks-0.1" | "synthetic-evidence-checks-0.1" | "synthetic-reconciliation-0.1";
  };
  protocol: {
    kind: "controlled_paired" | "observational_followup";
    primary_metric:
      "model_tokens" | "model_duration" | "human_effort" | "estimated_api_cost" | "rework_cycles" | "quality_rubric";
    direction: "lower_is_better" | "higher_is_better";
    quality_floor_definition: string;
    evaluator_version: string;
    metric_definition_version: "bl-metrics-0.1";
    frozen_before_execution: boolean;
    /**
     * @minItems 1
     * @maxItems 1000
     */
    planned_pair_ids: string[];
    intervention: string;
    compatibility: "comparable" | "not_comparable" | "unknown";
    resource_budget: {
      max_total_tokens: number | null;
      max_duration_seconds: number | null;
    };
    overhead_accounting: string;
  };
  conditions: {
    baseline: {
      platform: "claude_code" | "codex" | "other";
      model_version: string;
      effort: string;
      skill_version: string;
      /**
       * @minItems 0
       * @maxItems 30
       */
      tool_access: string[];
    };
    candidate: {
      platform: "claude_code" | "codex" | "other";
      model_version: string;
      effort: string;
      skill_version: string;
      /**
       * @minItems 0
       * @maxItems 30
       */
      tool_access: string[];
    };
  };
  /**
   * @minItems 0
   * @maxItems 1000
   */
  observations: {
    indicator:
      | "goal_definition"
      | "approach_consultation"
      | "iterative_refinement"
      | "quality_examples"
      | "output_structure"
      | "collaboration_mode"
      | "tone_preferences"
      | "audience_definition"
      | "context_gap_detection"
      | "reasoning_scrutiny"
      | "factual_verification";
    actor: "human" | "agent" | "tool" | "reviewer" | "unknown";
    channel: "conversation" | "external_check" | "self_report";
    state: "observed" | "not_observed" | "not_applicable" | "insufficient_evidence";
    rating: "partial" | "effective" | "adaptive" | null;
    evidence_reference: string | null;
    limitation: string;
  }[];
  /**
   * @minItems 1
   * @maxItems 1000
   */
  trials: {
    pair_id: string;
    order: "baseline_first" | "candidate_first";
    seed: number | null;
    baseline: {
      status: "completed" | "failed" | "timed_out" | "not_run";
      metrics: {
        model_tokens: number | null;
        model_duration: number | null;
        human_effort: number | null;
        estimated_api_cost: number | null;
        rework_cycles: number | null;
        quality_rubric: number | null;
      };
      quality_floor_passed: boolean | null;
      critical_regression: boolean | null;
      started_at: string | null;
      finished_at: string | null;
      failure_or_omission_reason: string | null;
    };
    candidate: {
      status: "completed" | "failed" | "timed_out" | "not_run";
      metrics: {
        model_tokens: number | null;
        model_duration: number | null;
        human_effort: number | null;
        estimated_api_cost: number | null;
        rework_cycles: number | null;
        quality_rubric: number | null;
      };
      quality_floor_passed: boolean | null;
      critical_regression: boolean | null;
      started_at: string | null;
      finished_at: string | null;
      failure_or_omission_reason: string | null;
    };
  }[];
  summary: {
    outcome: "improved" | "no_change" | "regressed" | "mixed" | "insufficient_evidence";
    /**
     * @minItems 1
     * @maxItems 1000
     */
    paired_relative_changes_percent: (number | null)[];
    uncertainty: string;
    /**
     * @minItems 0
     * @maxItems 20
     */
    limitations: string[];
  };
}
