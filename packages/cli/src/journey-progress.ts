import { activeRecommendation, type inspectJourney } from "@better-loop/journey";
import { summarizeLocalMilestones } from "@better-loop/discovery";
import type { LocalMilestoneEvent } from "@better-loop/discovery";

type Inspection = Pick<Awaited<ReturnType<typeof inspectJourney>>, "scope" | "assessment" | "host_assessment" | "outcomes">;
export function journeyProgress(current: Inspection) {
  const events: LocalMilestoneEvent[] = [];
  const followups: { outcome: Inspection["outcomes"][number]; event: LocalMilestoneEvent }[] = [];
  const active = activeRecommendation(current);
  const relevant = current.outcomes.filter(outcome => outcome.context?.recommendation_key === active?.key);
  for (const outcome of relevant) {
    if (outcome.content_origin === "unknown" || !outcome.context) continue;
    const common = {
      task_key: outcome.context.recommendation_key, equivalence_key: outcome.context.recommendation_key,
      content_origin: outcome.content_origin, evidence_available: current.assessment !== null,
    };
    if (outcome.reflection_completed && outcome.context.reflection_sequence !== null) events.push({
      ...common, kind: "reflection", change: "initial", reflection_completed: true,
      sequence: outcome.context.reflection_sequence,
      comparison: "unknown", outcome: "not_measured", quality_floor: "unknown", critical_regression: "unknown",
    });
    if (outcome.check && outcome.check.check_result !== "unknown") {
      const event: LocalMilestoneEvent = {
        ...common, kind: "followup", change: outcome.check.change, reflection_completed: false,
        // A later write is not a later check. Use when distinct evidence was first observed.
        sequence: outcome.context.first_observed_sequence,
        comparison: outcome.check.comparison, outcome: outcome.check.outcome,
        quality_floor: outcome.check.quality_floor, critical_regression: outcome.check.critical_regression,
      };
      events.push(event); followups.push({ outcome, event });
    }
  }
  const milestones = summarizeLocalMilestones(events);
  const reflections = events.filter(event => event.kind === "reflection");
  const checkedOutcomes = followups.filter(({ event }) =>
    summarizeLocalMilestones([...reflections, event]).later_comparable_outcome === "recorded").map(({ outcome }) => ({
      recorded_at: outcome.recorded_at, status: outcome.status, note: outcome.note,
      outcome: outcome.check!.outcome, quality_floor: outcome.check!.quality_floor,
      critical_regression: outcome.check!.critical_regression, check_result: outcome.check!.check_result,
      evidence_kind: outcome.context!.evidence_kind,
    }));
  const recommendation = active?.action ?? null;
  const acceptance = active?.acceptance_check ?? null;
  const latest = relevant.at(-1);
  let next = "Collect the first bounded baseline for the approved scope.";
  if (recommendation) next = latest?.status === "declined" || latest?.status === "did_not_help"
    ? "Retain the feedback and choose a smaller alternative with the user, with its own acceptance check."
    : latest && !["not_tried", "declined"].includes(latest.status)
      ? milestones.later_comparable_outcome === "recorded"
        ? "Keep the checked outcome, including negative findings, and choose the next useful question."
        : "Retain the reported feedback and check a later equivalent task against the same acceptance criteria. Comparability is not inferred from Git changes."
      : "Ask which recommendation the user wants to try, then retain the result of its acceptance check.";
  return {
    stages: [
      { step: "Assessment saved", state: active?.host ? "host_report_recorded" : current.assessment ? "local_diagnosis_only" : "next" },
      { step: "Try the chosen change", state: latest && !["not_tried", "declined"].includes(latest.status) ? "user_reported" : "not_recorded" },
      { step: "Check a later comparable outcome", state: milestones.later_comparable_outcome },
    ],
    recommendation, acceptance_check: acceptance, next_step: next, latest_user_outcome: latest ?? null, milestones,
    checked_outcomes: checkedOutcomes,
    host_assessment_status: active?.host ? "current" : current.host_assessment ? "prior_context_only" : "not_recorded",
    historical_feedback: current.outcomes.filter(outcome => outcome.context?.recommendation_key !== active?.key).slice(-3).map(outcome => ({
      recommendation_id: outcome.recommendation_id, status: outcome.status, note: outcome.note, association: "historical_not_current_progress",
    })),
    ability_score: null, measured_improvement: null,
    explanation: "These are local workflow steps and explicitly reported learning, not competence badges. A later comparable outcome needs distinct selected evidence first observed after reflection on this recommendation. Writes, note edits, unchanged scans, copies, disclosure, spending and publication earn no ability credit.",
  };
}
