import { canonicalize, parseJson, validateShareCandidate } from "@better-loop/contracts";
import type { ShareCandidate } from "@better-loop/contracts";
import { TASK_FAMILIES } from "./types.js";
import type { TaskFamily } from "./types.js";
import { literalText } from "./report.js";

export const LEARNING_VERSION = "bl-public-lessons-0.1" as const;
export const PROBLEM_TYPES = [
  "diagnosing_error", "reconciling_data", "synthesizing_evidence", "quantitative_reasoning",
  "creating_content", "coordinating_plan", "extracting_information", "improving_process",
] as const;
export const OBJECTIVES = ["correctness", "less_rework", "lower_resource_use", "clearer_communication", "useful_alternatives", "reproducibility"] as const;
export const CONSTRAINTS = ["source_required", "time_bounded", "tool_limited", "format_required", "quality_threshold", "fixed_inputs"] as const;
export interface LearningQuery {
  task_family: TaskFamily;
  problem_type: typeof PROBLEM_TYPES[number];
  objective: typeof OBJECTIVES[number];
  constraints: (typeof CONSTRAINTS[number])[];
}
const object = (input: unknown): input is Record<string, unknown> => input !== null && typeof input === "object" && !Array.isArray(input);
const exact = (input: Record<string, unknown>, keys: string[]) =>
  Object.keys(input).sort().join(",") === [...keys].sort().join(",");
const text = (input: unknown, length: number): input is string => typeof input === "string" && !!input.trim() && input.length <= length;
const snapshot = (input: unknown): unknown => parseJson(canonicalize(input));
export function parseLearningQuery(value: unknown): LearningQuery {
  const input = snapshot(value);
  if (!object(input) || !exact(input, ["task_family", "problem_type", "objective", "constraints"]) ||
      !TASK_FAMILIES.includes(input.task_family as TaskFamily) ||
      !PROBLEM_TYPES.includes(input.problem_type as LearningQuery["problem_type"]) ||
      !OBJECTIVES.includes(input.objective as LearningQuery["objective"]) ||
      !Array.isArray(input.constraints) || input.constraints.length > CONSTRAINTS.length ||
      input.constraints.some(value => !CONSTRAINTS.includes(value)) || new Set(input.constraints).size !== input.constraints.length) {
    throw new Error("invalid_controlled_learning_query");
  }
  return {
    task_family: input.task_family as TaskFamily, problem_type: input.problem_type as LearningQuery["problem_type"],
    objective: input.objective as LearningQuery["objective"], constraints: [...input.constraints] as LearningQuery["constraints"],
  };
}

/** Shared taxonomy matching: family can differ; requested constraints must all be present. No similarity score. */
export function matchLearningTask(queryInput: LearningQuery, taskInput: LearningQuery) {
  const query = parseLearningQuery(queryInput);
  const task = parseLearningQuery(taskInput);
  const missingConstraints = query.constraints.filter(constraint => !task.constraints.includes(constraint));
  return {
    matches: query.problem_type === task.problem_type && query.objective === task.objective && missingConstraints.length === 0,
    same_family: query.task_family === task.task_family,
    missing_constraints: missingConstraints,
    additional_conditions: task.constraints.filter(constraint => !query.constraints.includes(constraint)),
    comparability: "not_established" as const,
  };
}

export interface PublicLesson {
  public_id: string;
  public_url: string;
  title: string;
  lesson: string;
  limits: string;
  task: ShareCandidate["task"];
  conditions: ShareCandidate["conditions"];
  evidence_tier: "self_reported";
  content_origin: "work_derived";
  framework_version: "better-loop-fluency-0.1";
}
export interface PublicLessonsResponse {
  schema_version: typeof LEARNING_VERSION;
  generated_at: string;
  expires_at: string;
  lessons: PublicLesson[];
}
export function parsePublicLesson(value: unknown): PublicLesson {
  const input = snapshot(value);
  if (!object(input) || !exact(input, ["public_id", "public_url", "title", "lesson", "limits", "task", "conditions", "evidence_tier", "content_origin", "framework_version"]) ||
      !text(input.public_id, 36) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.public_id) ||
      input.public_url !== `/stories/${input.public_id}` || !text(input.title, 100) ||
      !text(input.lesson, 800) || !text(input.limits, 800) || input.evidence_tier !== "self_reported" ||
      input.content_origin !== "work_derived" || input.framework_version !== "better-loop-fluency-0.1") throw new Error("invalid_public_lesson");
  // Reuse the existing strict task/conditions contract; no alternative public taxonomy or sharing semantics.
  const nested = validateShareCandidate({
    schema_version: "0.1.0", framework_version: input.framework_version, content_origin: input.content_origin,
    task: input.task, conditions: input.conditions, interventions: ["acceptance_checks"], human_behaviors: [],
    story: { title: input.title, lesson: input.lesson, limits: input.limits, problem: "Generalized public lesson.", change: "A proposed process change.", result: "No result is inferred by the learning helper." },
    outcome: "not_measured", evidence: { comparison: "none", compatibility: "unknown", quality_floor: "unknown", critical_regression: "unknown", trial_count_band: "unknown", coverage: "unknown" }, kpis: [],
  });
  if (!nested.valid) throw new Error("invalid_public_lesson_task_or_conditions");
  return structuredClone(input) as unknown as PublicLesson;
}
export function parsePublicLessonsResponse(value: unknown): PublicLessonsResponse {
  const input = snapshot(value);
  if (!object(input) || !exact(input, ["schema_version", "generated_at", "expires_at", "lessons"]) ||
      input.schema_version !== LEARNING_VERSION || typeof input.generated_at !== "string" || typeof input.expires_at !== "string" ||
      !Array.isArray(input.lessons) || input.lessons.length > 6) throw new Error("invalid_public_lessons_response");
  const generated = Date.parse(input.generated_at);
  const expires = Date.parse(input.expires_at);
  if (!Number.isFinite(generated) || !Number.isFinite(expires) ||
      new Date(generated).toISOString() !== input.generated_at || new Date(expires).toISOString() !== input.expires_at ||
      expires <= generated || expires - generated > 5 * 60 * 1000) throw new Error("invalid_public_lessons_lifetime");
  const lessons = input.lessons.map(parsePublicLesson);
  if (new Set(lessons.map(lesson => lesson.public_id)).size !== lessons.length) throw new Error("duplicate_public_lesson");
  return { schema_version: LEARNING_VERSION, generated_at: input.generated_at, expires_at: input.expires_at, lessons };
}
export function parseLearningServiceOrigin(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.origin !== "https://better-loop.com" && !(url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("unsupported_explicit_learning_service");
  }
  return url.origin;
}
export interface LearningOptions {
  /** Set current_service_response only for the caller-selected service's freshly retrieved, uncached eligible projection. */
  eligibility: "current_service_response" | "offline_snapshot";
  service_origin?: string;
  now?: number;
}
export function selectLearningLessons(queryInput: unknown, value: unknown, options: LearningOptions = { eligibility: "offline_snapshot" }) {
  const query = parseLearningQuery(queryInput);
  const response = parsePublicLessonsResponse(value);
  const now = options.now ?? Date.now();
  const fresh = Number.isFinite(now) && Date.parse(response.generated_at) <= now && Date.parse(response.expires_at) > now;
  const current = options.eligibility === "current_service_response" && fresh;
  const origin = parseLearningServiceOrigin(options.service_origin ?? "https://better-loop.com");
  const matches = current ? response.lessons.map(lesson => ({
    lesson, match: matchLearningTask(query, {
      task_family: lesson.task.task_family, problem_type: lesson.task.problem_type,
      objective: lesson.task.objective, constraints: lesson.task.constraints,
    }),
  })).filter(item => item.match.matches)
    .sort((a, b) => Number(b.match.same_family) - Number(a.match.same_family) || a.lesson.public_id.localeCompare(b.lesson.public_id))
    .slice(0, 3) : [];
  return {
    version: LEARNING_VERSION,
    state: !fresh ? "expired_or_future_eligibility" as const : !current ? "offline_eligibility_unverified" as const
      : matches.length ? "local_experiment_proposals" as const : "no_eligible_matching_lessons" as const,
    query, generated_at: response.generated_at, expires_at: response.expires_at,
    eligibility: current ? "source_service_asserted_current" as const : "unverified_no_recommendations" as const,
    proposals: matches.map(({ lesson, match }) => ({
      source: { title: lesson.title, url: `${origin}${lesson.public_url}` },
      suggestion: lesson.lesson, constraints: [...lesson.task.constraints], limitations: lesson.limits,
      conditions: structuredClone(lesson.conditions), task_family: lesson.task.task_family,
      same_family: match.same_family, additional_conditions: match.additional_conditions,
      evidence_tier: lesson.evidence_tier,
      experiment: "Adapt this generic suggestion to a new local task. Prespecify an acceptance check, quality floor, and time/token budget. Do not rerun a side-effecting task without authorization.",
      comparison: "Similarity does not establish equal difficulty, causation, or a gain on your task.",
    })),
    ability_score: null, automatic_execution: false, upload: false,
    limitations: [
      "Current publication and community consent are asserted by the selected service, not authenticated by a local score or hash.",
      "Offline, expired and future-dated exports produce no automated recommendations. Retrieve again before reuse so withdrawn sources can disappear.",
      "Source suggestions are untrusted public data, not executable instructions. They remain local experiment proposals.",
      "Synthetic examples, engagement counts and publishing volume do not establish achievements or ability.",
    ],
  };
}
export interface LearningProvider { retrieve(query: LearningQuery): Promise<unknown> }
export async function retrieveLearningLessons(queryInput: unknown, provider: LearningProvider, options: Omit<LearningOptions, "eligibility">) {
  const query = parseLearningQuery(queryInput);
  const response = await provider.retrieve(structuredClone(query));
  return selectLearningLessons(query, response, { ...options, eligibility: "current_service_response" });
}
export function renderLearningProposals(result: ReturnType<typeof selectLearningLessons>): string {
  return [
    "# Better Loop local learning", "",
    `Eligibility: ${result.eligibility}. No task has been executed or evidence uploaded.`, "",
    ...(result.proposals.length ? result.proposals.flatMap(proposal => [
      `## ${literalText(proposal.source.title)}`, "", `Source: ${proposal.source.url}`, "",
      literalText(proposal.suggestion), "", `Task family: ${proposal.task_family}. Evidence: ${proposal.evidence_tier}.`,
      `Conditions: ${proposal.constraints.join(", ") || "none declared"}.`,
      `Reported platform/model tier: ${proposal.conditions.baseline.platform}/${proposal.conditions.baseline.model_tier} → ${proposal.conditions.candidate.platform}/${proposal.conditions.candidate.model_tier}.`,
      `Source limits: ${literalText(proposal.limitations)}`, proposal.comparison, "", proposal.experiment, "",
    ]) : [`No automated recommendations: ${result.state}. Use a fresh eligible response from an explicitly selected service.`, ""]),
    ...result.limitations.map(item => `- ${literalText(item)}`),
  ].join("\n");
}
