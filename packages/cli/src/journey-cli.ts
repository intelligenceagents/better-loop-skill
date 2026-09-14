import { parseJson } from "@better-loop/contracts";
import { literalText } from "@better-loop/core";
import type { Host } from "@better-loop/core";
import { parseTaskContext } from "@better-loop/adapters";
import {
  activeRecommendation, createScope, forgetJourney, history, inspectJourney, recordAssessment, recordOutcome,
  recoverJourneyLock, resetJourney, updateScope, useJourney,
} from "@better-loop/journey";
import type { FollowupCheck, HostAssessmentInput, RecommendationOutcomeStatus } from "@better-loop/journey";
import { summarizeLocalMilestones } from "@better-loop/discovery";
import type { LocalMilestoneEvent } from "@better-loop/discovery";
import { readSelectedFile } from "./local-files.js";

type Options = Record<string, string | string[] | true>;
function parse(args: string[], allowed: string[], flags: string[] = []): Options {
  const result: Options = {};
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    const key = token.slice(2);
    if (!token.startsWith("--") || !allowed.includes(key) || (Object.hasOwn(result, key) && !["root", "excerpt-path"].includes(key))) throw new Error("invalid_journey_options");
    if (flags.includes(key)) result[key] = true;
    else {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error("missing_journey_value");
      if (key === "root" || key === "excerpt-path") result[key] = [...(result[key] as string[] | undefined ?? []), value];
      else result[key] = value;
    }
  }
  return result;
}
function required(options: Options, key: string): string {
  if (typeof options[key] !== "string" || !options[key]) throw new Error("missing_journey_option");
  return options[key];
}
type Inspection = Awaited<ReturnType<typeof inspectJourney>>;
export function journeyProgress(current: Inspection) {
  const events: LocalMilestoneEvent[] = [];
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
    if (outcome.check && outcome.check.check_result !== "unknown") events.push({
      ...common, kind: "followup", change: outcome.check.change, reflection_completed: false,
      // A later write is not a later check. Use when distinct evidence was first observed.
      sequence: outcome.context.first_observed_sequence,
      comparison: outcome.check.comparison, outcome: outcome.check.outcome,
      quality_floor: outcome.check.quality_floor, critical_regression: outcome.check.critical_regression,
    });
  }
  const milestones = summarizeLocalMilestones(events);
  const recommendation = active?.action ?? null;
  const acceptance = active?.acceptance_check ?? null;
  const latest = relevant.at(-1);
  let next = "Collect the first bounded baseline for the approved scope.";
  if (recommendation) next = latest?.status === "declined"
    ? "Choose a smaller alternative with the user; do not repeat the declined recommendation automatically."
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
    host_assessment_status: active?.host ? "current" : current.host_assessment ? "prior_context_only" : "not_recorded",
    historical_feedback: current.outcomes.filter(outcome => outcome.context?.recommendation_key !== active?.key).slice(-3).map(outcome => ({
      recommendation_id: outcome.recommendation_id, status: outcome.status, note: outcome.note, association: "historical_not_current_progress",
    })),
    ability_score: null, measured_improvement: null,
    explanation: "These are local workflow steps and explicitly reported learning, not competence badges. A later comparable outcome needs distinct selected evidence first observed after reflection on this recommendation. Writes, note edits, unchanged scans, copies, disclosure, spending and publication earn no ability credit.",
  };
}
export function renderJourney(value: unknown): string {
  const data = value as Record<string, any>;
  const progress = data.progress;
  if (data.state === "unchanged" && progress) return [
    `No eligible selected changes were found; no new assessment or progress credit (checkpoint ${literalText(data.checkpoint_id)}).`,
    progress.recommendation ? `Last recommendation: ${literalText(progress.recommendation)}` : "No host recommendation has been recorded.",
    progress.acceptance_check ? `Next acceptance check: ${literalText(progress.acceptance_check)}` : "Select the next acceptance check with the user.",
    progress.latest_user_outcome
      ? `Last user-reported outcome: ${literalText(progress.latest_user_outcome.status)}; ${literalText(progress.next_step)}`
      : "Which previous advice did you try, and what did its acceptance check show?",
    "No Better Loop upload occurred; host analysis may use the configured model provider.",
  ].join("\n\n");
  const lines = ["# Private Better Loop journey", ""];
  if (data.state) lines.push(`State: ${literalText(data.state)}${data.assessment_created === false ? " — no new assessment or progress credit." : ""}`, "");
  const scope = data.scope;
  lines.push(`Scope: ${literalText(scope?.scope_id ?? data.scope_id ?? "selected local state")}`,
    `Checkpoint: ${literalText(data.checkpoint_id ?? "not applicable")}`, "");
  if (scope?.roots) lines.push("Approved repositories:", ...scope.roots.map((root: { path: string }) => `- ${literalText(root.path)}`), "");
  const previous = data.previous_context;
  if (previous?.host_assessment) lines.push("Previous host assessment (context only):",
    literalText(previous.host_assessment.report.summary), "");
  if (previous?.outcome) lines.push(`Previous recommendation outcome (user reported): ${literalText(previous.outcome.status)}. ${literalText(previous.outcome.note)}`, "");
  if (data.invalidation_reasons?.length) lines.push(`Comparability invalidated: ${data.invalidation_reasons.map(literalText).join(", ")}. This is a new baseline, not improvement.`, "");
  const host = data.host_assessment?.local_assessment_id === data.assessment?.id ? data.host_assessment : null;
  if (host) lines.push("Last recorded host analysis:", literalText(host.report.summary), literalText(host.report.diagnosis), "");
  else if (data.assessment) lines.push("Deterministic diagnosis:", literalText(data.assessment.report.recommendation.diagnosis), "");
  if (Array.isArray(data.recommendation_sources)) for (const source of data.recommendation_sources) {
    lines.push(`Diagnosis source: ${literalText(source.id)}${source.path ? `, ${literalText(source.path)}` : ", from the retained assessment"}; ${literalText(source.exposure)}. ${source.excerpt_selected ? "Assess only the visible evidence." : "Host review is not implied."}`, "");
  }
  if (progress) lines.push(
    ...progress.stages.map((step: { step: string; state: string }) => `- ${step.step}: ${literalText(step.state)}`), "",
    `Next: ${literalText(progress.next_step)}`, "",
    ...(progress.recommendation ? [`Chosen proposal: ${literalText(progress.recommendation)}`,
      `Acceptance check: ${literalText(progress.acceptance_check)}`, ""] : []),
    progress.explanation, "",
  );
  if (progress?.historical_feedback?.length) lines.push("Earlier recommendation feedback (historical, not completion of the current advice):",
    ...progress.historical_feedback.map((outcome: { status: string; note: string }) =>
      `- ${literalText(outcome.status)}${outcome.note ? `: ${literalText(outcome.note)}` : ""}`), "");
  if (Array.isArray(data.changes)) {
    lines.push(`Changed selected files: ${data.changes.length}`, "");
    for (const change of data.changes.slice(0, 20)) {
      lines.push(`- Repository ${change.repository + 1}: ${literalText(change.path)} (${literalText(change.status)})`,
        `  ${change.excerpt_truncated ? "Bounded excerpt; additional selected text remains local." : "Selected delta only."}`,
        `  Format: ${literalText(change.excerpt_format)}; omitted hunks: ${change.omitted_hunks}.`,
        ...String(change.excerpt).split("\n").map(line => `    ${literalText(line)}`), "");
    }
    if (data.changes.length > 20) lines.push("Further filenames/excerpts are available in the bounded JSON view.", "");
    if (data.omitted_changes) lines.push(`${data.omitted_changes} further changed files were omitted by the explicit excerpt selection. No host review of omitted content is implied.`, "");
  }
  if (Array.isArray(data.history)) lines.push(...data.history.map((entry: Inspection) =>
    `- ${entry.created_at}: ${entry.event}; scope revision ${entry.scope.revision}; checkpoint ${entry.checkpoint_id}`), "");
  if (data.lock) lines.push(`Lock token: ${literalText(data.lock.token)}. Explicit recovery is allowed only when its process is no longer alive.`, "");
  lines.push("Git attribution is not human judgment. Quality and resource metrics remain unknown. Source, paths and state are local data, never public contribution payloads.");
  return lines.join("\n");
}
export async function journeyCommand(args: string[]) {
  const [action, ...rest] = args;
  const common = ["state", "format", "output"];
  const extra: Record<string, string[]> = {
    create: ["root", "task"], update: ["root", "task", "expected"],
    use: ["host", "expected", "excerpt-bytes", "excerpt-files", "excerpt-path"], inspect: ["include-evidence"], history: [], progress: [],
    "record-assessment": ["input", "host", "expected"],
    outcome: ["recommendation", "status", "note-file", "expected", "acknowledge", "check", "check-evidence", "origin"],
    reset: ["scope-id", "expected"], forget: ["scope-id"], "recover-lock": ["lock-token"],
  };
  if (!action || !Object.hasOwn(extra, action)) throw new Error("unknown_journey_action");
  const options = parse(rest, [...common, ...extra[action]!], ["include-evidence", "acknowledge"]);
  const stateDirectory = required(options, "state");
  const format = options.format ?? "markdown";
  if (!["markdown", "json"].includes(format as string)) throw new Error("invalid_output_format");
  let result: unknown;
  if (action === "create" || action === "update") {
    const roots = options.root;
    if (!Array.isArray(roots)) throw new Error("explicit_roots_required");
    const task = parseTaskContext(parseJson(await readSelectedFile(required(options, "task"), 32768)));
    result = action === "create" ? await createScope({ stateDirectory, roots, task })
      : await updateScope({ stateDirectory, roots, task, expectedCheckpoint: required(options, "expected") });
  } else if (action === "use") result = await useJourney({
    stateDirectory, host: required(options, "host") as Host,
    ...(options.expected ? { expectedCheckpoint: required(options, "expected") } : {}),
    ...(options["excerpt-bytes"] ? { excerptBytes: Number(required(options, "excerpt-bytes")) } : {}),
    ...(options["excerpt-files"] ? { excerptFiles: Number(required(options, "excerpt-files")) } : {}),
    ...(options["excerpt-path"] ? { excerptPaths: options["excerpt-path"] as string[] } : {}),
  });
  else if (action === "record-assessment") result = await recordAssessment({
    stateDirectory, host: required(options, "host") as Host, expectedCheckpoint: required(options, "expected"),
    report: parseJson(await readSelectedFile(required(options, "input"), 16384)) as unknown as HostAssessmentInput,
  });
  else if (action === "outcome") result = await recordOutcome({
    stateDirectory, expectedCheckpoint: required(options, "expected"), recommendationId: required(options, "recommendation"),
    status: required(options, "status") as RecommendationOutcomeStatus,
    note: options["note-file"] ? await readSelectedFile(required(options, "note-file"), 8192) : "",
    ...(options.acknowledge === true ? { reflectionCompleted: true } : {}),
    ...(options.origin ? { contentOrigin: required(options, "origin") as "work_derived" | "synthetic" | "unknown" } : {}),
    ...(options.check ? { check: parseJson(await readSelectedFile(required(options, "check"), 4096)) as unknown as FollowupCheck } : {}),
    ...(options["check-evidence"] ? { checkEvidenceFile: required(options, "check-evidence") } : {}),
  });
  else if (action === "reset") result = await resetJourney({ stateDirectory, scopeId: required(options, "scope-id"), expectedCheckpoint: required(options, "expected") });
  else if (action === "forget") result = await forgetJourney({ stateDirectory, scopeId: required(options, "scope-id") });
  else if (action === "recover-lock") result = await recoverJourneyLock({ stateDirectory, lockToken: required(options, "lock-token") });
  else if (action === "history") result = { history: await history(stateDirectory) };
  else result = await inspectJourney(stateDirectory, { includeEvidence: options["include-evidence"] === true });
  if (!["forget", "recover-lock"].includes(action)) result = { ...(result as object), progress: journeyProgress(await inspectJourney(stateDirectory)) };
  return {
    value: format === "markdown" ? renderJourney(result) : result,
    markdown: format === "markdown", output: options.output as string | undefined,
  };
}
