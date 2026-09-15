import type { Compatibility, ConditionChange, TaskContext } from "./types.js";
import { equal, fail, object, snapshot, text } from "./guards.js";

const taskEnums = {
  task_family: ["software", "analysis_finance", "research_strategy", "mathematics_science", "writing_design", "operations_education", "general"],
  problem_type: ["diagnosing_error", "reconciling_data", "synthesizing_evidence", "quantitative_reasoning", "creating_content", "coordinating_plan", "extracting_information", "improving_process"],
  objective: ["correctness", "less_rework", "lower_resource_use", "clearer_communication", "useful_alternatives", "reproducibility"],
  difficulty: ["routine", "moderate", "complex", "unknown"],
  difficulty_basis: ["self_estimated", "rubric_estimated", "unknown"],
  task_contract_version: ["bl-task-0.1"],
  benchmark_contract: ["unregistered", "synthetic-code-checks-0.1", "synthetic-evidence-checks-0.1", "synthetic-reconciliation-0.1"],
} as const;
const constraints = ["source_required", "time_bounded", "tool_limited", "format_required", "quality_threshold", "fixed_inputs"];
const skills = [
  "goal_definition", "approach_consultation", "iterative_refinement", "quality_examples", "output_structure",
  "collaboration_mode", "tone_preferences", "audience_definition", "context_gap_detection", "reasoning_scrutiny",
  "factual_verification", "task_decomposition", "tool_selection", "domain_validation", "useful_alternatives", "learning_transfer",
];
export const CONDITION_KEYS = ["platform", "model_version", "effort", "skill_version", "tool_access"] as const;

function stringList(input: unknown, max: number): asserts input is string[] {
  if (!Array.isArray(input) || input.length > max || new Set(input).size !== input.length) fail("invalid_context");
  input.forEach(value => text(value, "invalid_context"));
}

export function validateTaskContext(input: TaskContext): TaskContext {
  const context = snapshot(input);
  object(context, [
    "task", "input_version", "equivalence_group", "acceptance_criteria_version", "evaluator_version",
    "metric_definition_version", "metric_unit", "resource_conditions", "conditions",
  ], "invalid_context");
  object(context.task, [...Object.keys(taskEnums), "constraints", "demonstrated_skills"], "invalid_context");
  for (const [key, values] of Object.entries(taskEnums)) {
    if (!(values as readonly unknown[]).includes(context.task[key as keyof typeof taskEnums])) fail("invalid_context");
  }
  stringList(context.task.constraints, 6);
  stringList(context.task.demonstrated_skills, 8);
  if (context.task.constraints.some(value => !constraints.includes(value)) ||
      context.task.demonstrated_skills.some(value => !skills.includes(value))) fail("invalid_context");
  for (const value of [context.input_version, context.acceptance_criteria_version, context.evaluator_version,
    context.metric_definition_version, context.resource_conditions]) text(value, "invalid_context");
  if (context.equivalence_group !== null) text(context.equivalence_group, "invalid_context");
  if (!["count", "seconds", "USD", "index", "percent", "proportion"].includes(context.metric_unit)) fail("invalid_context");
  object(context.conditions, CONDITION_KEYS, "invalid_context");
  if (!["claude_code", "codex", "other"].includes(context.conditions.platform)) fail("invalid_context");
  for (const value of [context.conditions.model_version, context.conditions.effort, context.conditions.skill_version]) text(value, "invalid_context");
  stringList(context.conditions.tool_access, 30);
  return context;
}

/** Similar taxonomy never establishes numerical comparability on its own. */
export function compareTasks(
  inputBaseline: TaskContext, inputCandidate: TaskContext, allowedConditionChanges: readonly ConditionChange[] = [],
): Compatibility {
  const baseline = validateTaskContext(inputBaseline);
  const candidate = validateTaskContext(inputCandidate);
  if (!Array.isArray(allowedConditionChanges) || new Set(allowedConditionChanges).size !== allowedConditionChanges.length ||
      allowedConditionChanges.some(key => !CONDITION_KEYS.includes(key))) fail("invalid_allowed_condition_changes");
  const reasons: string[] = [];
  const taxonomy = ["task_family", "problem_type", "objective"] as const;
  const similarity = taxonomy.every(key => baseline.task[key] === candidate.task[key]) ? "same_taxonomy" : "different_taxonomy";
  for (const key of [...taxonomy, "difficulty", "difficulty_basis", "task_contract_version", "benchmark_contract"] as const) {
    if (baseline.task[key] !== candidate.task[key]) reasons.push(`task_${key}_mismatch`);
  }
  if (!equal([...baseline.task.constraints].sort(), [...candidate.task.constraints].sort())) reasons.push("task_constraints_mismatch");
  for (const key of ["acceptance_criteria_version", "evaluator_version", "metric_definition_version", "metric_unit", "resource_conditions"] as const) {
    if (baseline[key] !== candidate[key]) reasons.push(`${key}_mismatch`);
  }
  if (baseline.input_version !== candidate.input_version &&
      !(baseline.equivalence_group && baseline.equivalence_group === candidate.equivalence_group)) reasons.push("input_equivalence_not_established");
  for (const key of CONDITION_KEYS) {
    if (allowedConditionChanges.includes(key)) continue;
    const a = key === "tool_access" ? [...baseline.conditions.tool_access].sort() : baseline.conditions[key];
    const b = key === "tool_access" ? [...candidate.conditions.tool_access].sort() : candidate.conditions[key];
    if (!equal(a, b)) reasons.push(`condition_${key}_mismatch`);
  }
  if (reasons.length) return { similarity, status: "not_comparable", reasons };
  if (baseline.task.difficulty === "unknown" || baseline.task.difficulty_basis === "unknown") {
    return { similarity, status: "unknown", reasons: ["difficulty_not_established"] };
  }
  return { similarity, status: "comparable", reasons: [] };
}
