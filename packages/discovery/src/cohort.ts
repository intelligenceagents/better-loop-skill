import { canonicalize } from "@better-loop/contracts";
import { eligible, exact, invalid, isCurrent, oneOf, parseRecords, snapshot, TIERS, validTaskConditions } from "./input.js";
import type { BenchmarkCohortQuery, BenchmarkCohortRecord, BenchmarkCohortResult, DiscoveryContext } from "./types.js";
import { FROZEN_REGISTRATION } from "./frozen-benchmark.js";

export const MINIMUM_COHORT_OWNERS = 20 as const;
const queryKeys = ["benchmark_id", "benchmark_version", "benchmark_conditions_version", "framework_version", "rubric_id",
  "task", "conditions", "comparison", "metric", "metric_definition_version", "direction", "metric_provenance", "server_trust_tier", "benchmark_basis"];
const taskKeys = ["task_family", "problem_type", "objective", "difficulty", "difficulty_basis", "constraints", "task_contract_version"];
function parseQuery(input: BenchmarkCohortQuery): BenchmarkCohortQuery {
  const value = snapshot(input, 4_096);
  if (!exact(value, queryKeys) || value.benchmark_id !== "bl-public-approval-binding" || value.benchmark_version !== "0.1" ||
      value.benchmark_conditions_version !== "bl-approval-binding-readonly-0.1" ||
      value.framework_version !== "better-loop-fluency-0.1" || value.rubric_id !== "bl-work-evidence-0.1" ||
      value.metric_definition_version !== "bl-metrics-0.1" ||
      !oneOf(value.metric, ["model_tokens", "model_duration", "human_effort", "estimated_api_cost", "rework_cycles", "quality_rubric"]) ||
      !oneOf(value.direction, ["lower_is_better", "higher_is_better"]) ||
      !oneOf(value.metric_provenance, ["self_reported", "locally_captured", "estimated"]) ||
      !oneOf(value.comparison, ["controlled_paired", "observational_followup"]) ||
      !oneOf(value.server_trust_tier, TIERS) || !oneOf(value.benchmark_basis, ["locally_recorded", "self_reported"]) ||
      !exact(value.task, taskKeys) ||
      !validTaskConditions({ ...value.task, demonstrated_skills: [], benchmark_contract: "unregistered" }, value.conditions)) invalid();
  const query = value as unknown as BenchmarkCohortQuery;
  if (query.direction !== (query.metric === "quality_rubric" ? "higher_is_better" : "lower_is_better")) invalid();
  // The only registered task cannot become a benchmark for another family by copying its ID.
  for (const field of ["task_family", "problem_type", "objective", "difficulty", "difficulty_basis"] as const) {
    if (query.task[field] !== FROZEN_REGISTRATION.task[field]) invalid();
  }
  if (canonicalize([...query.task.constraints].sort()) !== canonicalize([...FROZEN_REGISTRATION.task.constraints].sort())) invalid();
  // A broad/unknown condition cannot establish an exact cohort.
  if (query.task.difficulty === "unknown" || query.task.difficulty_basis === "unknown" ||
      Object.values(query.conditions).some(arm => arm.platform === "unknown" || arm.model_tier === "unknown")) invalid();
  return query;
}
function taxonomyMatches(query: BenchmarkCohortQuery, row: BenchmarkCohortRecord): boolean {
  return taskKeys.every(key => {
    const field = key as keyof BenchmarkCohortQuery["task"];
    return field === "constraints"
      ? canonicalize([...query.task.constraints].sort()) === canonicalize([...row.candidate.task.constraints].sort())
      : query.task[field] === row.candidate.task[field];
  });
}
const round5 = (value: number): number => Math.round(value / 5) * 5;
const average = (values: number[]): number => values.reduce((sum, value) => sum + value / values.length, 0);
export function aggregateBenchmarkCohort(queryInput: BenchmarkCohortQuery, records: readonly BenchmarkCohortRecord[], context: DiscoveryContext): BenchmarkCohortResult {
  const base: BenchmarkCohortResult = {
    version: "bl-descriptive-cohort-0.1", state: "invalid_input", minimum_distinct_owners: MINIMUM_COHORT_OWNERS, cohort: null, statistics: null,
    limitations: [
      "Descriptive normalized indices only; no raw business metrics, population percentiles, causal improvement or validated hiring claims.",
      "Twenty distinct owners and rounding are privacy heuristics, not an anonymity guarantee or protection against differencing queries.",
      "Equal owner weight includes all their eligible current records; neutral and negative values are retained without best-result selection.",
      "Server trust tiers, benchmark bases, metric provenance and exact comparison conditions are never pooled across query strata.",
      "Recompute from a complete current authoritative snapshot on every use; discard cached results after withdrawal, deletion or opt-out.",
      "This pure helper does not authenticate server IDs or consent. Services must enforce query controls and must never expose operational input.",
    ],
  };
  try {
    const query = parseQuery(queryInput);
    if (!isCurrent(context)) return { ...base, state: "current_snapshot_required" };
    const ownerValues = new Map<string, number[]>();
    for (const row of parseRecords(records, true)) {
      const candidate = row.candidate;
      const capsule = row.capability_evidence;
      if (!eligible(row) || row.consent?.benchmark_aggregation !== true || !capsule ||
          capsule.change === "revision_only" || capsule.change === "unknown" ||
          capsule.benchmark?.id !== query.benchmark_id || capsule.benchmark.version !== query.benchmark_version ||
          capsule.benchmark.basis !== query.benchmark_basis || capsule.benchmark.result !== "met" ||
          row.benchmark_conditions_version !== query.benchmark_conditions_version ||
          capsule.rubric_id !== query.rubric_id || candidate.framework_version !== query.framework_version ||
          candidate.task.benchmark_contract !== "unregistered" || row.server_trust_tier !== query.server_trust_tier ||
          !taxonomyMatches(query, row) || canonicalize(candidate.conditions) !== canonicalize(query.conditions) ||
          candidate.evidence.comparison !== query.comparison || candidate.evidence.compatibility !== "comparable" ||
          candidate.evidence.quality_floor !== "met" || candidate.evidence.critical_regression !== "none_observed" ||
          !capsule.quality_checks.some(check => check.dimension === "correctness" && check.result === "met") ||
          capsule.quality_checks.some(check => check.result === "unknown" ||
            check.evaluator === "unknown" || check.basis === "unknown")) continue;
      const metrics = candidate.kpis.filter(kpi => kpi.metric === query.metric && kpi.metric_definition_version === query.metric_definition_version &&
        kpi.direction === query.direction && kpi.provenance === query.metric_provenance);
      if (metrics.length !== 1) continue;
      const metric = metrics[0]!;
      if (!Number.isFinite(metric.candidate_index) || metric.baseline_index !== 100 ||
          metric.precision !== "rounded_to_5_index_points" || metric.candidate_index % 5 !== 0) continue;
      const values = ownerValues.get(row.server_owner_id) ?? [];
      values.push(metric.candidate_index);
      ownerValues.set(row.server_owner_id, values);
    }
    if (ownerValues.size < MINIMUM_COHORT_OWNERS) return { ...base, state: "suppressed" };
    const values = [...ownerValues.values()].map(average).sort((a, b) => a - b);
    const center = Math.floor(values.length / 2);
    const median = values.length % 2 ? values[center]! : average([values[center - 1]!, values[center]!]);
    return {
      ...base, state: "available", cohort: query,
      statistics: {
        distinct_owners_rounded_down_to_5: Math.floor(values.length / 5) * 5,
        baseline_index: 100, mean_candidate_index: round5(average(values)), median_candidate_index: round5(median),
        rounding: "nearest_5_index_points", aggregation: "equal_owner_weight_mean_of_current_eligible_records",
        metric: query.metric, direction: query.direction, trust_tier: query.server_trust_tier, benchmark_basis: query.benchmark_basis,
      },
    };
  } catch { return base; }
}
