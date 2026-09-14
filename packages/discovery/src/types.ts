import type { ShareCandidate } from "@better-loop/contracts";
import type { CapabilityEvidence, ContributionConsent, HumanAction, QualityDimension } from "@better-loop/evidence";

export type { ShareCandidate, CapabilityEvidence, ContributionConsent, HumanAction, QualityDimension };
export type Task = ShareCandidate["task"];
export type Skill = Task["demonstrated_skills"][number];
export type TrustTier = "self_reported" | "locally_recorded" | "independently_verified";

/** Caller boundary assertion, not authentication. Services must supply fresh authoritative data. */
export interface DiscoveryContext {
  source: "current_server_snapshot" | "offline_snapshot";
  complete: boolean;
}
/** Operational input. Never serialize this whole object into a public response. */
export interface PublicEvidenceRecord {
  public_id: string;
  current: boolean;
  status: "published" | "withdrawn" | "deleted" | "held";
  candidate: ShareCandidate;
  capability_evidence: CapabilityEvidence | null;
  /** Legacy contributions have null consent and no inferred downstream opt-in. */
  consent: ContributionConsent | null;
  /** Set by the admitting server, never copied from a submitted capsule. */
  server_trust_tier: TrustTier;
}
export interface RoleCriteria {
  task_families: Task["task_family"][];
  problem_types: Task["problem_type"][];
  objectives: Task["objective"][];
  required_skills: Skill[];
  required_quality_checks: QualityDimension[];
  required_human_actions: HumanAction[];
  /** Exact requested complexity, never a numeric ability threshold. */
  difficulty: Task["difficulty"];
}
export interface RoleEvidenceMatch {
  public_id: string;
  task: {
    family: "matched" | "different";
    problem: "matched";
    objective: "matched";
    difficulty: "matched" | "different" | "unknown" | "not_requested";
    difficulty_basis: Task["difficulty_basis"];
    conditions: ShareCandidate["conditions"];
    comparability: "not_established";
  };
  skills: { supported: Skill[]; missing: Skill[]; claim: "reported_task_evidence" };
  quality: Array<{ dimension: QualityDimension; check: CapabilityEvidence["quality_checks"][number] | null }>;
  human_attribution: {
    involvement: CapabilityEvidence["human_involvement"];
    assessment_basis: CapabilityEvidence["assessment_basis"];
    actions: Array<{ action: HumanAction; evidence: CapabilityEvidence["human_actions"][number] | null }>;
    claim: "reported_attribution_not_independent_authorship";
  };
  gaps: Array<{
    area: "family" | "difficulty" | "skill" | "quality" | "human_action";
    requirement: Task["task_family"] | Task["difficulty"] | Skill | QualityDimension | HumanAction;
    reason: "different_context" | "missing_evidence" | "unknown_result" | "check_not_met" | "attestation_only";
  }>;
  trust: { tier: TrustTier; reasons: string[] };
}
export type DiscoveryState = "available" | "no_eligible_records" | "current_snapshot_required" | "invalid_input";
export interface RoleEvidenceResult {
  version: "bl-discovery-0.1";
  state: DiscoveryState;
  matches: RoleEvidenceMatch[];
  limitations: string[];
}
export interface BenchmarkCohortQuery {
  benchmark_id: "bl-public-approval-binding";
  benchmark_version: "0.1";
  benchmark_conditions_version: "bl-approval-binding-readonly-0.1";
  framework_version: "better-loop-fluency-0.1";
  rubric_id: "bl-work-evidence-0.1";
  task: Pick<Task, "task_family" | "problem_type" | "objective" | "difficulty" | "difficulty_basis" | "constraints" | "task_contract_version">;
  conditions: ShareCandidate["conditions"];
  comparison: "controlled_paired" | "observational_followup";
  metric: ShareCandidate["kpis"][number]["metric"];
  metric_definition_version: "bl-metrics-0.1";
  direction: ShareCandidate["kpis"][number]["direction"];
  metric_provenance: ShareCandidate["kpis"][number]["provenance"];
  server_trust_tier: TrustTier;
  benchmark_basis: NonNullable<CapabilityEvidence["benchmark"]>["basis"];
}
export interface BenchmarkCohortRecord extends PublicEvidenceRecord {
  /** Private server-derived deduplication key; must never be a public profile ID. */
  server_owner_id: string;
  benchmark_conditions_version: "bl-approval-binding-readonly-0.1";
}
export interface BenchmarkCohortResult {
  version: "bl-descriptive-cohort-0.1";
  state: "available" | "suppressed" | "current_snapshot_required" | "invalid_input";
  minimum_distinct_owners: 20;
  cohort: BenchmarkCohortQuery | null;
  statistics: null | {
    distinct_owners_rounded_down_to_5: number;
    baseline_index: 100;
    mean_candidate_index: number;
    median_candidate_index: number;
    rounding: "nearest_5_index_points";
    aggregation: "equal_owner_weight_mean_of_current_eligible_records";
    metric: BenchmarkCohortQuery["metric"];
    direction: BenchmarkCohortQuery["direction"];
    trust_tier: TrustTier;
    benchmark_basis: BenchmarkCohortQuery["benchmark_basis"];
  };
  limitations: string[];
}

/** Private local inputs only. Keys group the same actual task and copies, not revisions or posts. */
export interface LocalMilestoneEvent {
  task_key: string;
  equivalence_key: string;
  sequence: number;
  kind: "reflection" | "followup";
  content_origin: "work_derived" | "synthetic";
  change: CapabilityEvidence["change"] | "copy" | "unchanged";
  reflection_completed: boolean;
  evidence_available: boolean;
  comparison: ShareCandidate["evidence"]["compatibility"];
  outcome: ShareCandidate["outcome"];
  quality_floor: ShareCandidate["evidence"]["quality_floor"];
  critical_regression: ShareCandidate["evidence"]["critical_regression"];
}
export interface MilestoneSummary {
  version: "bl-evidence-milestones-0.1";
  space: "local" | "public";
  state: DiscoveryState;
  reflection: "recorded" | "not_established";
  later_comparable_outcome: "recorded" | "not_established";
  retained_outcomes: ShareCandidate["outcome"][];
  quality: "floor_met_no_critical_regression" | "regression_or_floor_failure" | "unknown" | "mixed";
  evidence_label: "local_record_not_independent_verification" | "public_self_reported_evidence";
  limitations: string[];
}
