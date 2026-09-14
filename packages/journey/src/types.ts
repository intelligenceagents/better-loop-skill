import type { Host, TaskContext } from "@better-loop/core";
import type { DeltaArtifact, DeltaReport, RecommendationOutcome } from "./diagnosis.js";

export const JOURNEY_VERSION = "0.1.0-draft.1" as const;
export const JOURNEY_SCHEMA = "bl-private-journey-0.1" as const;
export const COLLECTION_POLICY = "bl-tracked-text-0.1" as const;
export const LIMITS = Object.freeze({
  repositories: 8, filesPerRepository: 1000, fileBytes: 65536, totalTextBytes: 2 * 1024 * 1024,
  gitBytes: 2 * 1024 * 1024, gitTimeoutMs: 5000, checkpointBytes: 16 * 1024 * 1024,
  checkpoints: 64, excerptBytes: 131072,
});
export interface SelectedRoot { path: string; identity: string }
export interface JourneyScope {
  scope_id: string; revision: number; roots: SelectedRoot[]; task: TaskContext;
  framework_version: string; collection_policy: typeof COLLECTION_POLICY;
}
export interface TrackedText { path: string; hash: string; text: string }
export interface RepositorySnapshot {
  root: string; identity: string; head: string | null;
  files: TrackedText[];
  unavailable: string[];
  excluded: Record<string, number>;
}
export interface JourneyAssessment {
  id: string; host: Host; created_at: string;
  report: DeltaReport;
}
export interface HostAssessmentInput {
  summary: string;
  diagnosis: string;
  next_action: string;
  acceptance_check: string;
  limitations: string[];
}
export interface HostAssessment {
  id: string; host: Host; recorded_at: string; assessed_checkpoint_id: string; local_assessment_id: string;
  method: "host_semantic_reasoning"; human_attribution: "not_independently_verified";
  report: HostAssessmentInput;
  revision: number;
}
export interface JourneyCheckpoint {
  schema_version: typeof JOURNEY_SCHEMA;
  checkpoint_id: string; sequence: number; previous_digest: string | null; previous_checkpoint: string | null; created_at: string;
  event: "created" | "baseline" | "delta" | "unchanged" | "invalidated" | "scope_updated" | "outcome" | "host_assessment" | "reset";
  scope: JourneyScope;
  snapshots: RepositorySnapshot[] | null;
  assessment: JourneyAssessment | null;
  host_assessment: HostAssessment | null;
  outcomes: RecommendationOutcome[];
  invalidation_reasons: string[];
}
export interface StoredJourney { checkpoint: JourneyCheckpoint; digest: string }
export interface JourneyChange extends DeltaArtifact {
  repository: number; excerpt: string; excerpt_truncated: boolean;
  excerpt_format: "unified_hunks" | "bounded_samples_not_diff" | "unavailable";
  omitted_hunks: number;
}
export interface JourneyUseResult {
  state: "baseline" | "changed" | "unchanged" | "invalidated";
  scope_id: string; revision: number; checkpoint_id: string;
  assessment_created: boolean;
  assessment: JourneyAssessment | null;
  previous_context: {
    assessment_id: string; recommendation: string; outcome: RecommendationOutcome | null;
    host_assessment: HostAssessment | null; comparability: "not_established" | "invalidated";
  } | null;
  changes: Omit<JourneyChange, "before" | "after">[];
  recommendation_sources: {
    id: string; path: string | null; repository: number | null; excerpt_selected: boolean;
    exposure: "omitted_by_selection" | "omitted_by_budget" | "partial_hunks" | "complete_hunks" | "samples_only" | "unavailable";
  }[];
  omitted_changes: number;
  excluded: Record<string, number>[];
  invalidation_reasons: string[];
  private_only: true;
}
export class JourneyError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "JourneyError"; }
}
