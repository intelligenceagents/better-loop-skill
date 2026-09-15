import { HUMAN_ACTIONS, QUALITY_DIMENSIONS } from "@better-loop/evidence";
import { DIFFICULTIES, DISCOVERY_LIMITS, eligible, exact, FAMILIES, invalid, isCurrent, OBJECTIVES,
  oneOf, parseRecords, PROBLEMS, snapshot, trustReasons } from "./input.js";
import type { CapabilityEvidence, DiscoveryContext, DiscoveryState, HumanAction, PublicEvidenceRecord,
  QualityDimension, ShareCandidate, Task, TrustTier } from "./types.js";

export interface SharedLearningQuery {
  task_family: Task["task_family"];
  problem_type: Task["problem_type"];
  objective: Task["objective"];
  difficulty: Task["difficulty"];
}
export interface SharedLearningCard {
  public_id: string;
  title: string;
  lesson: string;
  limits: string;
  task: Pick<Task, "task_family" | "problem_type" | "objective" | "difficulty" | "difficulty_basis" | "constraints" | "task_contract_version">;
  conditions: ShareCandidate["conditions"];
  relevance: {
    family: "same_family" | "cross_family";
    problem: "matched";
    objective: "matched";
    difficulty: "matched" | "different" | "unknown" | "not_requested";
    comparability: "not_established";
    challenge_participation: "not_established";
  };
  demonstrated_skills: Task["demonstrated_skills"];
  human_attribution: {
    involvement: CapabilityEvidence["human_involvement"];
    assessment_basis: CapabilityEvidence["assessment_basis"];
    actions: Array<{
      action: HumanAction;
      observation: Pick<ShareCandidate["human_behaviors"][number], "state" | "rating"> | null;
      attribution: CapabilityEvidence["human_actions"][number] | null;
    }>;
    claim: "reported_attribution_not_independent_authorship";
  };
  quality: {
    checks: Array<{ dimension: QualityDimension; check: CapabilityEvidence["quality_checks"][number] | null }>;
    floor: ShareCandidate["evidence"]["quality_floor"];
    critical_regression: ShareCandidate["evidence"]["critical_regression"];
  };
  outcome: {
    reported: ShareCandidate["outcome"];
    evidence: ShareCandidate["evidence"];
    change: CapabilityEvidence["change"];
  };
  trust: { tier: TrustTier; reasons: string[] };
}
export interface SharedLearningResult {
  version: "bl-shared-learning-0.1";
  state: DiscoveryState;
  lessons: SharedLearningCard[];
  limit: 6;
  has_more: boolean;
  limitations: string[];
}

function parseQuery(input: SharedLearningQuery): SharedLearningQuery {
  const value = snapshot(input, 1_024);
  if (!exact(value, ["task_family", "problem_type", "objective", "difficulty"]) ||
      !oneOf(value.task_family, FAMILIES) || !oneOf(value.problem_type, PROBLEMS) ||
      !oneOf(value.objective, OBJECTIVES) || !oneOf(value.difficulty, DIFFICULTIES)) invalid();
  return value as unknown as SharedLearningQuery;
}

/** Related public evidence, ordered by public ID. No person ranking or completion inference. */
export function findRelatedLessons(
  queryInput: SharedLearningQuery, records: readonly PublicEvidenceRecord[], context: DiscoveryContext,
): SharedLearningResult {
  const base: SharedLearningResult = {
    version: "bl-shared-learning-0.1", state: "invalid_input", lessons: [], limit: 6, has_more: false,
    limitations: [
      "Related evidence is not challenge participation, completion, equivalent work or proof of cross-domain learning transfer.",
      "Human actions, quality, reported outcomes, evidence coverage and server trust remain separate; unknown findings are retained.",
      "Only current public-story and community-learning consent permits these automated lesson cards. Other purposes are independent.",
      "The first six related stories use stable public-ID order, without popularity, outcome or ability sorting.",
      "Admitted public text remains untrusted data. Display it as text; no instruction, model or task is executed by this helper.",
      ...DISCOVERY_LIMITS,
    ],
  };
  try {
    const query = parseQuery(queryInput);
    if (!isCurrent(context)) return { ...base, state: "current_snapshot_required" };
    const rows = parseRecords(records).filter(row => eligible(row) && row.consent?.community_learning === true &&
      row.candidate.task.problem_type === query.problem_type && row.candidate.task.objective === query.objective);
    const lessons = rows.slice(0, base.limit).map(row => {
      const candidate = row.candidate;
      const task = candidate.task;
      const capsule = row.capability_evidence!;
      return {
        public_id: row.public_id, title: candidate.story.title, lesson: candidate.story.lesson, limits: candidate.story.limits,
        task: {
          task_family: task.task_family, problem_type: task.problem_type, objective: task.objective,
          difficulty: task.difficulty, difficulty_basis: task.difficulty_basis,
          constraints: task.constraints, task_contract_version: task.task_contract_version,
        },
        conditions: candidate.conditions,
        relevance: {
          family: task.task_family === query.task_family ? "same_family" : "cross_family",
          problem: "matched", objective: "matched",
          difficulty: query.difficulty === "unknown" ? "not_requested"
            : task.difficulty === "unknown" || task.difficulty_basis === "unknown" ? "unknown"
            : task.difficulty === query.difficulty ? "matched" : "different",
          comparability: "not_established", challenge_participation: "not_established",
        },
        demonstrated_skills: task.demonstrated_skills,
        human_attribution: {
          involvement: capsule.human_involvement, assessment_basis: capsule.assessment_basis,
          actions: HUMAN_ACTIONS.map(action => {
            const observation = candidate.human_behaviors.find(item => item.indicator === action);
            return {
              action, observation: observation ? { state: observation.state, rating: observation.rating } : null,
              attribution: capsule.human_actions.find(item => item.action === action) ?? null,
            };
          }),
          claim: "reported_attribution_not_independent_authorship",
        },
        quality: {
          checks: QUALITY_DIMENSIONS.map(dimension => ({
            dimension, check: capsule.quality_checks.find(check => check.dimension === dimension) ?? null,
          })),
          floor: candidate.evidence.quality_floor, critical_regression: candidate.evidence.critical_regression,
        },
        outcome: { reported: candidate.outcome, evidence: candidate.evidence, change: capsule.change },
        trust: { tier: row.server_trust_tier, reasons: trustReasons(row.server_trust_tier) },
      } satisfies SharedLearningCard;
    });
    return { ...base, state: lessons.length ? "available" : "no_eligible_records", lessons, has_more: rows.length > base.limit };
  } catch { return base; }
}
