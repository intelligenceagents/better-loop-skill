import { parseJson } from "@better-loop/contracts";
import { literalText } from "@better-loop/core";
import type { Host } from "@better-loop/core";
import { parseTaskContext } from "@better-loop/adapters";
import {
  createScope, forgetJourney, history, inspectJourney, recordAssessment, recordOutcome,
  recoverJourneyLock, resetJourney, updateScope, useJourney,
} from "@better-loop/journey";
import type { FollowupCheck, HostAssessmentInput, RecommendationOutcomeStatus } from "@better-loop/journey";
import { journeyProgress } from "./journey-progress.js";
export { journeyProgress } from "./journey-progress.js";
import { readSelectedFile } from "./local-files.js";
import { writeJourneyView } from "./journey-view.js";

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
function concise(value: string): string {
  const text = value.replace(/\s+/gu, " ").trim();
  return literalText(text.length <= 240 ? text : text.slice(0, 240).trimEnd() + "… [full wording in inspect/view]");
}
export function renderJourney(value: unknown): string {
  const data = value as Record<string, any>;
  const progress = data.progress;
  if (data.state === "unchanged" && progress) return [
    "No eligible selected changes; no new assessment or progress credit.",
    progress.recommendation ? `Last recommendation: ${concise(progress.recommendation)}` : "No host recommendation has been recorded.",
    progress.acceptance_check ? `Next acceptance check: ${concise(progress.acceptance_check)}` : "Select the next acceptance check with the user.",
    progress.latest_user_outcome
      ? `Last user-reported outcome: ${literalText(progress.latest_user_outcome.status)}; ${concise(progress.next_step)}`
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
  if (action === "view") {
    const options = parse(rest, ["state", "output", "format", "include-changes", "excerpt-bytes", "excerpt-files"], ["include-changes"]);
    if (options.format !== undefined && options.format !== "json") throw new Error("viewer_receipt_format_must_be_json");
    if (!options["include-changes"] && (options["excerpt-bytes"] || options["excerpt-files"])) throw new Error("include_changes_required_for_excerpts");
    return {
      value: await writeJourneyView({
        stateDirectory: required(options, "state"), output: required(options, "output"),
        includeChanges: options["include-changes"] === true,
        ...(options["excerpt-bytes"] ? { excerptBytes: Number(required(options, "excerpt-bytes")) } : {}),
        ...(options["excerpt-files"] ? { excerptFiles: Number(required(options, "excerpt-files")) } : {}),
      }),
      markdown: false, output: undefined,
    };
  }
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
