import { DISCOVERY_LIMITS, eligible, isCurrent, parseCriteria, parseRecords, trustReasons } from "./input.js";
import type { DiscoveryContext, PublicEvidenceRecord, RoleCriteria, RoleEvidenceMatch, RoleEvidenceResult } from "./types.js";

/** Lists relevant stories in stable public-ID order. Does not rank people or combine dimensions. */
export function matchRoleEvidence(criteria: RoleCriteria, records: readonly PublicEvidenceRecord[], context: DiscoveryContext): RoleEvidenceResult {
  const result: RoleEvidenceResult = { version: "bl-discovery-0.1", state: "invalid_input", matches: [], limitations: [...DISCOVERY_LIMITS] };
  try {
    const query = parseCriteria(criteria);
    if (!isCurrent(context)) return { ...result, state: "current_snapshot_required" };
    const rows = parseRecords(records).filter(row => eligible(row) && row.consent?.candidate_discovery === true &&
      query.problem_types.includes(row.candidate.task.problem_type) && query.objectives.includes(row.candidate.task.objective));
    result.matches = rows.map(row => {
      const task = row.candidate.task;
      const capsule = row.capability_evidence!;
      const gaps: RoleEvidenceMatch["gaps"] = [];
      const sameFamily = query.task_families.includes(task.task_family);
      if (!sameFamily) gaps.push({ area: "family", requirement: task.task_family, reason: "different_context" });
      const difficulty = query.difficulty === "unknown" ? "not_requested"
        : task.difficulty === "unknown" || task.difficulty_basis === "unknown" ? "unknown"
        : query.difficulty === task.difficulty ? "matched" : "different";
      if (difficulty === "unknown" || difficulty === "different") gaps.push({
        area: "difficulty", requirement: query.difficulty, reason: difficulty === "unknown" ? "missing_evidence" : "different_context",
      });
      const supported = query.required_skills.filter(skill => task.demonstrated_skills.includes(skill));
      const missing = query.required_skills.filter(skill => !task.demonstrated_skills.includes(skill));
      for (const skill of missing) gaps.push({ area: "skill", requirement: skill, reason: "missing_evidence" });
      const quality = query.required_quality_checks.map(dimension => {
        const check = capsule.quality_checks.find(check => check.dimension === dimension) ?? null;
        if (!check || check.result !== "met") gaps.push({
          area: "quality", requirement: dimension,
          reason: !check ? "missing_evidence" : check.result === "unknown" ? "unknown_result" : "check_not_met",
        });
        return { dimension, check };
      });
      const actions = query.required_human_actions.map(action => {
        const evidence = capsule.human_actions.find(item => item.action === action) ?? null;
        if (!evidence || evidence.evidence === "unknown") gaps.push({ area: "human_action", requirement: action, reason: "missing_evidence" });
        else {
          if (evidence.evidence === "user_attestation") gaps.push({ area: "human_action", requirement: action, reason: "attestation_only" });
          if (evidence.outcome_check !== "met") gaps.push({
            area: "human_action", requirement: action, reason: evidence.outcome_check === "unknown" ? "unknown_result" : "check_not_met",
          });
        }
        return { action, evidence };
      });
      return {
        public_id: row.public_id,
        task: { family: sameFamily ? "matched" : "different", problem: "matched", objective: "matched", difficulty,
          difficulty_basis: task.difficulty_basis, conditions: row.candidate.conditions, comparability: "not_established" },
        skills: { supported, missing, claim: "reported_task_evidence" },
        quality,
        human_attribution: { involvement: capsule.human_involvement, assessment_basis: capsule.assessment_basis,
          actions, claim: "reported_attribution_not_independent_authorship" },
        gaps, trust: { tier: row.server_trust_tier, reasons: trustReasons(row.server_trust_tier) },
      } satisfies RoleEvidenceMatch;
    });
    return { ...result, state: result.matches.length ? "available" : "no_eligible_records" };
  } catch { return { ...result, state: "invalid_input", matches: [] }; }
}
