import { canonicalize } from "@better-loop/contracts";
import { QUALITY_DIMENSIONS } from "@better-loop/evidence";
import { MINIMUM_COHORT_OWNERS } from "./cohort.js";
import { eligible, exact, invalid, isCurrent, MAX_RECORDS, oneOf, parseRecords, snapshot, TIERS,
  uniqueValues, validTaskConditions } from "./input.js";
import type { CapabilityEvidence, DiscoveryContext, PublicEvidenceRecord, QualityDimension, ShareCandidate, Task, TrustTier } from "./types.js";

/** Server-only operational input. Never serialize this record as a public response. */
export interface SharedSignalRecord extends PublicEvidenceRecord {
  server_owner_id: string;
}
export type SharedProgressTask = Omit<Pick<Task, "task_family" | "problem_type" | "objective" | "difficulty" |
  "difficulty_basis" | "constraints" | "task_contract_version">, "difficulty" | "difficulty_basis"> & {
  difficulty: Exclude<Task["difficulty"], "unknown">;
  difficulty_basis: Exclude<Task["difficulty_basis"], "unknown">;
};
export type KnownProgressCondition = {
  platform: Exclude<ShareCandidate["conditions"]["baseline"]["platform"], "unknown">;
  model_tier: Exclude<ShareCandidate["conditions"]["baseline"]["model_tier"], "unknown">;
};
export interface SharedProgressQuery {
  version: "bl-shared-progress-query-0.1";
  framework_version: "better-loop-fluency-0.1";
  rubric_id: "bl-work-evidence-0.1";
  metric_definition_version: "bl-metrics-0.1";
  task: SharedProgressTask;
  conditions: { baseline: KnownProgressCondition; candidate: KnownProgressCondition };
  comparison: "controlled_paired" | "observational_followup";
  metric: ShareCandidate["kpis"][number]["metric"];
  direction: ShareCandidate["kpis"][number]["direction"];
  metric_provenance: ShareCandidate["kpis"][number]["provenance"];
  server_trust_tier: TrustTier;
  required_quality_dimensions: QualityDimension[];
  quality_evaluator: Exclude<CapabilityEvidence["quality_checks"][number]["evaluator"], "unknown">;
  quality_basis: Exclude<CapabilityEvidence["quality_checks"][number]["basis"], "unknown">;
}
export interface SharedProgressResult {
  version: "bl-shared-progress-0.1";
  state: "available" | "suppressed" | "current_snapshot_required" | "invalid_input";
  claim: "uncalibrated_descriptive_reported_progress";
  minimum_distinct_owners: 20;
  cohort: SharedProgressQuery | null;
  statistics: null | {
    distinct_owners_rounded_down_to_5: number;
    baseline_index: 100;
    mean_candidate_index: number;
    median_candidate_index: number;
    rounding: "nearest_5_index_points";
    aggregation: "equal_owner_weight_mean_of_current_eligible_records";
    metric: SharedProgressQuery["metric"];
    direction: SharedProgressQuery["direction"];
    quality_floor: "met";
    critical_regression: "none_observed";
    coverage: "not_aggregated";
  };
  limitations: string[];
}

const taskKeys = ["task_family", "problem_type", "objective", "difficulty", "difficulty_basis", "constraints", "task_contract_version"] as const;
const queryKeys = ["version", "framework_version", "rubric_id", "metric_definition_version", "task", "conditions",
  "comparison", "metric", "direction", "metric_provenance", "server_trust_tier", "required_quality_dimensions", "quality_evaluator", "quality_basis"];
const recordKeys = ["public_id", "current", "status", "candidate", "capability_evidence", "consent", "server_trust_tier", "server_owner_id"];

function parseQuery(input: SharedProgressQuery): SharedProgressQuery {
  const value = snapshot(input, 4_096);
  if (!exact(value, queryKeys) || value.version !== "bl-shared-progress-query-0.1" ||
      value.framework_version !== "better-loop-fluency-0.1" || value.rubric_id !== "bl-work-evidence-0.1" ||
      value.metric_definition_version !== "bl-metrics-0.1" ||
      !oneOf(value.metric, ["model_tokens", "model_duration", "human_effort", "estimated_api_cost", "rework_cycles", "quality_rubric"]) ||
      !oneOf(value.direction, ["lower_is_better", "higher_is_better"]) ||
      !oneOf(value.metric_provenance, ["self_reported", "locally_captured", "estimated"]) ||
      !oneOf(value.comparison, ["controlled_paired", "observational_followup"]) ||
      !oneOf(value.server_trust_tier, TIERS) ||
      !uniqueValues(value.required_quality_dimensions, QUALITY_DIMENSIONS, 1) ||
      !oneOf(value.quality_evaluator, ["human", "agent", "tool"]) ||
      !oneOf(value.quality_basis, ["locally_recorded", "self_reported"]) ||
      !exact(value.task, taskKeys) ||
      !validTaskConditions({ ...value.task, demonstrated_skills: [], benchmark_contract: "unregistered" }, value.conditions)) invalid();
  const query = value as unknown as SharedProgressQuery;
  if (query.direction !== (query.metric === "quality_rubric" ? "higher_is_better" : "lower_is_better") ||
      (query.metric === "estimated_api_cost" && query.metric_provenance !== "estimated") ||
      (query.task.objective === "correctness" && !query.required_quality_dimensions.includes("correctness")) ||
      !oneOf(query.task.difficulty, ["routine", "moderate", "complex"]) ||
      !oneOf(query.task.difficulty_basis, ["self_estimated", "rubric_estimated"]) ||
      Object.values(query.conditions).some(arm => !oneOf(arm.platform, ["claude_code", "codex", "other"]) ||
        !oneOf(arm.model_tier, ["economy", "standard", "frontier"]))) invalid();
  query.task.constraints.sort();
  query.required_quality_dimensions.sort();
  return query;
}

function parseSignalRecords(input: readonly SharedSignalRecord[]): SharedSignalRecord[] {
  if (!Array.isArray(input) || input.length > MAX_RECORDS) invalid();
  const current = new Map<string, SharedSignalRecord>();
  const publicRows = input.map(item => {
    const value = snapshot(item);
    if (!exact(value, recordKeys) || typeof value.server_owner_id !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(value.server_owner_id)) invalid();
    const row = value as unknown as SharedSignalRecord;
    if (row.current) {
      const previous = current.get(row.public_id);
      // Owner conflicts are significant even if the public projection is identical.
      if (previous && canonicalize(previous) !== canonicalize(row)) invalid();
      current.set(row.public_id, row);
    }
    const { server_owner_id: _owner, ...publicRow } = row;
    return publicRow;
  });
  // Reuse complete candidate/capsule/current-state validation without a fictitious benchmark condition.
  return parseRecords(publicRows).map(row => ({ ...row, server_owner_id: current.get(row.public_id)!.server_owner_id }));
}

function matchesTask(query: SharedProgressQuery, row: SharedSignalRecord): boolean {
  return taskKeys.every(field => field === "constraints"
    ? canonicalize(query.task.constraints) === canonicalize([...row.candidate.task.constraints].sort())
    : query.task[field] === row.candidate.task[field]);
}
const average = (values: number[]): number => values.reduce((sum, value) => sum + value / values.length, 0);
const round5 = (value: number): number => Math.round(value / 5) * 5;

/** Descriptive relative measurements only; this does not register or score a challenge. */
export function aggregateSharedProgress(
  queryInput: SharedProgressQuery, records: readonly SharedSignalRecord[], context: DiscoveryContext,
): SharedProgressResult {
  const base: SharedProgressResult = {
    version: "bl-shared-progress-0.1", state: "invalid_input", claim: "uncalibrated_descriptive_reported_progress",
    minimum_distinct_owners: MINIMUM_COHORT_OWNERS, cohort: null, statistics: null,
    limitations: [
      "Uncalibrated descriptive reported progress, not a validated benchmark, equivalent tasks, person ranking, population percentile or causal improvement.",
      "Baseline 100; lower uses fewer tokens for model_tokens. Only relative normalized indices are available, never raw usage or token-budget bands.",
      "Twenty distinct owners and rounding are privacy heuristics, not an anonymity guarantee or protection against differencing queries.",
      "All eligible current measurements are averaged within each owner, then owners receive equal weight. Neutral and adverse results are retained.",
      "Required quality checks, their evaluator/basis, measurement provenance, comparison track and server trust must match; missing evidence is not zero.",
      "Coverage is not aggregated; passing the chosen quality floor does not establish complete evidence, independent verification or human judgment.",
      "Broad model tiers and minimized task categories do not establish exact-model or accounting equivalence. Cost, model time and human effort remain separate.",
      "Only current public-story and benchmark-aggregation consent permits these numbers. Learning and candidate-discovery purposes are independent.",
      "The caller must authenticate owner/trust and supply current effective consent. Refresh the complete authoritative snapshot after every change; do not cache results.",
      "Serve finite controlled presets with query controls. Never expose operational input, per-owner results or an arbitrary query/differencing surface.",
    ],
  };
  try {
    const query = parseQuery(queryInput);
    if (!isCurrent(context)) return { ...base, state: "current_snapshot_required" };
    const ownerValues = new Map<string, number[]>();
    for (const row of parseSignalRecords(records)) {
      const candidate = row.candidate;
      const capsule = row.capability_evidence;
      if (!eligible(row) || row.consent?.benchmark_aggregation !== true || !capsule ||
          (capsule.change !== "initial" && capsule.change !== "followup") ||
          capsule.rubric_id !== query.rubric_id || candidate.framework_version !== query.framework_version ||
          row.server_trust_tier !== query.server_trust_tier || !matchesTask(query, row) ||
          canonicalize(candidate.conditions) !== canonicalize(query.conditions) ||
          candidate.evidence.comparison !== query.comparison || candidate.evidence.compatibility !== "comparable" ||
          candidate.evidence.quality_floor !== "met" || candidate.evidence.critical_regression !== "none_observed" ||
          !query.required_quality_dimensions.every(dimension => capsule.quality_checks.some(check =>
            check.dimension === dimension && check.result === "met" && check.evaluator === query.quality_evaluator &&
            check.basis === query.quality_basis))) continue;
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
        metric: query.metric, direction: query.direction, quality_floor: "met", critical_regression: "none_observed",
        coverage: "not_aggregated",
      },
    };
  } catch { return base; }
}
