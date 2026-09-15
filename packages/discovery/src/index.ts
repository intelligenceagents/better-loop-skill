export type * from "./types.js";
export { matchRoleEvidence } from "./matching.js";
export { aggregateBenchmarkCohort, MINIMUM_COHORT_OWNERS } from "./cohort.js";
export { summarizeLocalMilestones, summarizePublicMilestones } from "./milestones.js";
export {
  PUBLIC_APPROVAL_BINDING_BENCHMARK, PUBLIC_APPROVAL_BINDING_RESULTS, APPROVAL_BINDING_CASE_IDS, APPROVAL_BINDING_REASONS,
  APPROVAL_BINDING_LIMITS, judgeApprovalBindingOutput,
} from "./benchmark.js";
export type { ApprovalBindingAnswer, ApprovalBindingJudgment } from "./benchmark.js";
export { listSharedChallenges } from "./challenges.js";
export type { ChallengeId, SharedChallenge } from "./challenges.js";
export { findRelatedLessons } from "./learning.js";
export type { SharedLearningQuery, SharedLearningCard, SharedLearningResult } from "./learning.js";
export { aggregateSharedProgress } from "./signals.js";
export type { SharedSignalRecord, SharedProgressTask, KnownProgressCondition, SharedProgressQuery, SharedProgressResult } from "./signals.js";
export const DISCOVERY_VERSION = "0.2.0-draft.1" as const;
