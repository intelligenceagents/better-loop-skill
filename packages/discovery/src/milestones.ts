import { DISCOVERY_LIMITS, eligible, exact, invalid, isCurrent, MAX_RECORDS, oneOf, OUTCOMES, parseRecords, retainedOutcomes, snapshot } from "./input.js";
import type { DiscoveryContext, LocalMilestoneEvent, MilestoneSummary, PublicEvidenceRecord, ShareCandidate } from "./types.js";

function empty(space: "local" | "public"): MilestoneSummary {
  return {
    version: "bl-evidence-milestones-0.1", space, state: "no_eligible_records", reflection: "not_established",
    later_comparable_outcome: "not_established", retained_outcomes: [], quality: "unknown",
    evidence_label: space === "local" ? "local_record_not_independent_verification" : "public_self_reported_evidence",
    limitations: [
      "Milestones describe reflection and checked follow-up, including useful neutral and negative findings; they confer no ability badge.",
      "Copies, revisions, unchanged tasks, task counts, tokens, spending, model choice and publishing volume earn no progress credit.",
      "Missing evidence remains unestablished; automation and Git attribution do not prove human judgment.",
      ...(space === "public" ? ["Public summaries are self-reported; sanitized records cannot independently establish distinct tasks or human authorship.", ...DISCOVERY_LIMITS] :
        ["Local keys and sequence are supplied by the caller. Bind them to the selected actual task and its later evidence; this helper cannot attest identity or chronology."]),
    ],
  };
}
function qualitySummary(items: Array<{ quality_floor: ShareCandidate["evidence"]["quality_floor"]; critical_regression: ShareCandidate["evidence"]["critical_regression"] }>): MilestoneSummary["quality"] {
  const states = new Set(items.map(item => item.quality_floor === "not_met" || item.critical_regression === "observed"
    ? "regression_or_floor_failure" as const
    : item.quality_floor === "met" && item.critical_regression === "none_observed"
      ? "floor_met_no_critical_regression" as const : "unknown" as const));
  return states.size > 1 ? "mixed" : [...states][0] ?? "unknown";
}
function parseEvents(input: readonly LocalMilestoneEvent[]): LocalMilestoneEvent[] {
  if (!Array.isArray(input) || input.length > MAX_RECORDS) invalid();
  const events = input.map(item => {
    const value = snapshot(item, 2_048);
    if (!exact(value, ["task_key", "equivalence_key", "sequence", "kind", "content_origin", "change",
      "reflection_completed", "evidence_available", "comparison", "outcome", "quality_floor", "critical_regression"]) ||
        typeof value.task_key !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.task_key) ||
        typeof value.equivalence_key !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.equivalence_key) ||
        !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 0 ||
        !oneOf(value.kind, ["reflection", "followup"]) || !oneOf(value.content_origin, ["work_derived", "synthetic"]) ||
        !oneOf(value.change, ["initial", "followup", "revision_only", "unknown", "copy", "unchanged"]) ||
        typeof value.reflection_completed !== "boolean" || typeof value.evidence_available !== "boolean" ||
        !oneOf(value.comparison, ["comparable", "not_comparable", "unknown"]) || !oneOf(value.outcome, OUTCOMES) ||
        !oneOf(value.quality_floor, ["met", "not_met", "unknown"]) ||
        !oneOf(value.critical_regression, ["none_observed", "observed", "unknown"])) invalid();
    return value as unknown as LocalMilestoneEvent;
  });
  return events.sort((a, b) => a.sequence - b.sequence);
}
function checked(outcome: ShareCandidate["outcome"]): boolean {
  return outcome !== "not_measured" && outcome !== "insufficient_evidence";
}
export function summarizeLocalMilestones(eventsInput: readonly LocalMilestoneEvent[]): MilestoneSummary {
  const result = empty("local");
  try {
    const events = parseEvents(eventsInput).filter(event => event.content_origin === "work_derived" && event.evidence_available &&
      (event.change === "initial" || event.change === "followup"));
    const reflections = events.filter(event => event.kind === "reflection" && event.reflection_completed);
    const later = events.filter(event => event.kind === "followup" && event.change === "followup" &&
      event.comparison === "comparable" && checked(event.outcome) &&
      reflections.some(prior => prior.task_key === event.task_key && prior.equivalence_key === event.equivalence_key &&
        prior.sequence < event.sequence));
    return {
      ...result, state: reflections.length || later.length ? "available" : "no_eligible_records",
      reflection: reflections.length ? "recorded" : "not_established",
      later_comparable_outcome: later.length ? "recorded" : "not_established",
      retained_outcomes: retainedOutcomes(later.map(event => event.outcome)), quality: qualitySummary(later),
    };
  } catch { return { ...result, state: "invalid_input" }; }
}
export function summarizePublicMilestones(records: readonly PublicEvidenceRecord[], context: DiscoveryContext): MilestoneSummary {
  const result = empty("public");
  try {
    if (!isCurrent(context)) return { ...result, state: "current_snapshot_required" };
    const rows = parseRecords(records).filter(row => eligible(row) &&
      (row.capability_evidence!.change === "initial" || row.capability_evidence!.change === "followup"));
    const later = rows.filter(row => row.capability_evidence!.change === "followup" &&
      row.candidate.evidence.comparison === "observational_followup" && row.candidate.evidence.compatibility === "comparable" &&
      row.candidate.evidence.coverage !== "unknown" && checked(row.candidate.outcome) &&
      row.capability_evidence!.quality_checks.some(check => check.result !== "unknown"));
    return {
      ...result, state: rows.length ? "available" : "no_eligible_records",
      reflection: rows.length ? "recorded" : "not_established",
      later_comparable_outcome: later.length ? "recorded" : "not_established",
      retained_outcomes: retainedOutcomes(later.map(row => row.candidate.outcome)),
      quality: qualitySummary(later.map(row => row.candidate.evidence)),
    };
  } catch { return { ...result, state: "invalid_input" }; }
}
