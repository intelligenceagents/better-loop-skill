import { canonicalize, validateShareCandidate } from "@better-loop/contracts";
import { HUMAN_ACTIONS, QUALITY_DIMENSIONS, validateContribution, validateContributionConsent } from "@better-loop/evidence";
import type { BenchmarkCohortRecord, DiscoveryContext, PublicEvidenceRecord, RoleCriteria, ShareCandidate } from "./types.js";

export const MAX_RECORDS = 1_000;
export const FAMILIES = ["software", "analysis_finance", "research_strategy", "mathematics_science", "writing_design", "operations_education", "general"] as const;
export const PROBLEMS = ["diagnosing_error", "reconciling_data", "synthesizing_evidence", "quantitative_reasoning", "creating_content", "coordinating_plan", "extracting_information", "improving_process"] as const;
export const OBJECTIVES = ["correctness", "less_rework", "lower_resource_use", "clearer_communication", "useful_alternatives", "reproducibility"] as const;
export const SKILLS = [...HUMAN_ACTIONS, "task_decomposition", "tool_selection", "domain_validation", "useful_alternatives", "learning_transfer"] as const;
export const TIERS = ["self_reported", "locally_recorded", "independently_verified"] as const;
export const DIFFICULTIES = ["routine", "moderate", "complex", "unknown"] as const;
export const OUTCOMES = ["improved", "no_change", "regressed", "mixed", "not_measured", "insufficient_evidence"] as const;
export function invalid(): never { throw new Error("invalid_discovery_input"); }
export function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
export function oneOf(value: unknown, values: readonly string[]): boolean {
  return typeof value === "string" && values.includes(value);
}
export function uniqueValues(value: unknown, values: readonly string[], minimum = 0): boolean {
  return Array.isArray(value) && value.length >= minimum && value.length <= values.length &&
    value.every(item => oneOf(item, values)) && new Set(value).size === value.length;
}
export function snapshot(value: unknown, maximum = 28_672): unknown {
  const text = canonicalize(value);
  if (new TextEncoder().encode(text).byteLength > maximum) invalid();
  return JSON.parse(text) as unknown;
}
export function isCurrent(context: DiscoveryContext): boolean {
  const value = snapshot(context, 512);
  if (!exact(value, ["source", "complete"]) || !oneOf(value.source, ["current_server_snapshot", "offline_snapshot"]) ||
      typeof value.complete !== "boolean") invalid();
  return value.source === "current_server_snapshot" && value.complete === true;
}
export function parseCriteria(input: RoleCriteria): RoleCriteria {
  const value = snapshot(input, 4_096);
  if (!exact(value, ["task_families", "problem_types", "objectives", "required_skills", "required_quality_checks", "required_human_actions", "difficulty"]) ||
      !uniqueValues(value.task_families, FAMILIES, 1) || !uniqueValues(value.problem_types, PROBLEMS, 1) ||
      !uniqueValues(value.objectives, OBJECTIVES, 1) || !uniqueValues(value.required_skills, SKILLS) ||
      !uniqueValues(value.required_quality_checks, QUALITY_DIMENSIONS) || !uniqueValues(value.required_human_actions, HUMAN_ACTIONS) ||
      !oneOf(value.difficulty, DIFFICULTIES)) invalid();
  return value as unknown as RoleCriteria;
}
const rowKeys = ["public_id", "current", "status", "candidate", "capability_evidence", "consent", "server_trust_tier"];
export function parseRecords(input: readonly PublicEvidenceRecord[], cohort?: false): PublicEvidenceRecord[];
export function parseRecords(input: readonly BenchmarkCohortRecord[], cohort: true): BenchmarkCohortRecord[];
export function parseRecords(input: readonly PublicEvidenceRecord[], cohort = false): BenchmarkCohortRecord[] | PublicEvidenceRecord[] {
  if (!Array.isArray(input) || input.length > MAX_RECORDS) invalid();
  const rows = input.map(item => {
    const value = snapshot(item);
    if (!exact(value, cohort ? [...rowKeys, "server_owner_id", "benchmark_conditions_version"] : rowKeys) ||
        typeof value.public_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.public_id) ||
        typeof value.current !== "boolean" || !oneOf(value.status, ["published", "withdrawn", "deleted", "held"]) ||
        !oneOf(value.server_trust_tier, TIERS)) invalid();
    if (cohort && (typeof value.server_owner_id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.server_owner_id) ||
        value.benchmark_conditions_version !== "bl-approval-binding-readonly-0.1")) invalid();
    if (value.consent !== null && !validateContributionConsent(value.consent).valid) invalid();
    if (value.capability_evidence === null) {
      if (!validateShareCandidate(value.candidate).valid) invalid();
    } else if (!validateContribution({
      schema_version: "bl-contribution-0.2", candidate: value.candidate, capability_evidence: value.capability_evidence,
    }).valid) invalid();
    return value as unknown as BenchmarkCohortRecord;
  });
  // Ignore historical versions. Conflicting current states require an authoritative reread.
  const current = new Map<string, BenchmarkCohortRecord>();
  for (const row of rows.filter(row => row.current)) {
    const previous = current.get(row.public_id);
    if (previous && canonicalize(previous) !== canonicalize(row)) invalid();
    current.set(row.public_id, row);
  }
  return [...current.values()].sort((a, b) => a.public_id.localeCompare(b.public_id));
}
export function eligible(row: PublicEvidenceRecord): boolean {
  return row.current && row.status === "published" && row.candidate.content_origin === "work_derived" &&
    row.consent?.public_story === true && row.capability_evidence !== null;
}
/** Reuses the unchanged candidate schema for controlled query taxonomy/conditions. */
export function validTaskConditions(task: unknown, conditions: unknown): boolean {
  return validateShareCandidate({
    schema_version: "0.1.0", framework_version: "better-loop-fluency-0.1", content_origin: "work_derived",
    task, conditions, interventions: ["acceptance_checks"], human_behaviors: [],
    story: { title: "Controlled query", problem: "A generalized task.", change: "A stated approach.",
      result: "No result inferred.", lesson: "Use an acceptance check.", limits: "No ability inference." },
    outcome: "not_measured",
    evidence: { comparison: "none", compatibility: "unknown", quality_floor: "unknown",
      critical_regression: "unknown", trial_count_band: "unknown", coverage: "unknown" },
    kpis: [],
  }).valid;
}
export const DISCOVERY_LIMITS = [
  "Taxonomy similarity does not establish equal difficulty, human ability or role fitness; no person ranking or hiring decision is produced.",
  "Missing evidence is not poor performance. Task skill tags and locally recorded claims remain reported evidence.",
  "Current publication, consent and trust are supplied by the server. This pure helper cannot authenticate a caller or independently verify work.",
  "Refresh authoritative input after withdrawal, deletion or opt-out; discard previously derived results and caches immediately.",
];
export function trustReasons(tier: PublicEvidenceRecord["server_trust_tier"]): string[] {
  return [
    tier === "independently_verified" ? "Independent tier asserted by admitting server; the helper does not perform verification."
      : tier === "locally_recorded" ? "Local instrumentation remains under the author's control; it is not independent verification."
      : "Self-reported public evidence; local capsule claims do not raise the server trust tier.",
    "Account email verification, a known benchmark ID and agent execution do not verify human judgment.",
  ];
}
export function retainedOutcomes(values: ShareCandidate["outcome"][]): ShareCandidate["outcome"][] {
  return OUTCOMES.filter(outcome => values.includes(outcome));
}
