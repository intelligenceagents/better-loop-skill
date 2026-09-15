import { adapterCapabilities } from "@better-loop/adapters";
import { CONTRACT_PACKAGE_VERSION } from "@better-loop/contracts";
import { PRIVACY_VERSION, REVIEW_POLICY_VERSION } from "@better-loop/privacy";
import { MEASUREMENT_VERSION } from "@better-loop/measurement";
import { JOURNEY_VERSION } from "@better-loop/journey";
import { EVIDENCE_VERSION, EVIDENCE_REVIEW_POLICY_VERSION } from "@better-loop/evidence";
import { HANDOFF_PROTOCOL } from "@better-loop/handoff";
import { DISCOVERY_VERSION } from "@better-loop/discovery";
import { createRequire } from "node:module";

// Resolve these four installed manifests beside this package in ESM and CJS.
// The CJS build maps import.meta.url to its absolute __filename.
const packageRequire = createRequire(import.meta.url);
const corePackage = packageRequire("@better-loop/core/package.json") as { version: string };
const adaptersPackage = packageRequire("@better-loop/adapters/package.json") as { version: string };
const measurementPackage = packageRequire("@better-loop/measurement/package.json") as { version: string };
const handoffPackage = packageRequire("@better-loop/handoff/package.json") as { version: string };

export const CLI_VERSION = "0.5.0-draft.1" as const;
export function capabilities() {
  return {
    protocol: "bl-capabilities-0.2", helper_version: CLI_VERSION,
    packages: {
      contracts: CONTRACT_PACKAGE_VERSION, core: corePackage.version, adapters: adaptersPackage.version,
      privacy: PRIVACY_VERSION, measurement: measurementPackage.version, journey: JOURNEY_VERSION,
      evidence: EVIDENCE_VERSION, discovery: DISCOVERY_VERSION, handoff: handoffPackage.version,
    },
    capabilities: {
      selected_assessment: true, explicit_artifact_capture: true, descriptive_indicators: 11, calibrated_ranking: false,
      prompt_rewrite: true, static_skill_audit: true, scoped_instruction_plan_apply_rollback: true,
      candidate_scan: true, reviewed_candidate_preview: true, exact_local_confirmation: true,
      semantic_review: "requires_two_explicit_configured_reviewers",
      semantic_review_policy: REVIEW_POLICY_VERSION, upload: false, identity: false,
      local_measurement: MEASUREMENT_VERSION, local_milestones: true,
      local_learning: "fresh_eligible_public_response_only",
      live_learning_endpoint: "explicit_service_only_no_default",
      explicit_repository_journey: true, persisted_host_assessment: true,
      delta_only_followup: true, unchanged_assessment_credit: false,
      local_progress_viewer: "explicit_private_html_snapshot_no_scripts_or_network",
      capability_contribution: true, contribution_review_policy: EVIDENCE_REVIEW_POLICY_VERSION,
      browser_handoff: HANDOFF_PROTOCOL, browser_handoff_activation: "explicit_after_exact_contribution_confirmation",
      release_check: "fixed_public_github_metadata_only_no_update",
      personal_coach: "explicit_preferences_scoped_plan_apply_rollback",
      shared_practice: "controlled_challenges_related_lessons_descriptive_progress",
    },
    adapters: adapterCapabilities(),
    boundaries: {
      default_network: false, raw_evidence_upload: false, history_scan: false,
      provider: "Deterministic collection/assessment makes no model request. A host reading selected local source or reports uses its configured model provider. Explicit semantic reviewer commands receive only the minimized candidate or whole minimized contribution, never raw journey state.",
      learning_service: "Only explicit service requests use GET with controlled taxonomy and no auth, cookies, private task text, or evidence.",
      release_check: "Only the release-check command requests fixed public GitHub metadata. Skill entry may call it after exact helper detection, within user tool/network scope. No local version or private data is sent; observations do not verify installed source.",
    },
  };
}
export { planInstructionChange, applyInstructionChange, readSelectedFile, writePrivateOutput } from "./local-files.js";
export type { InstructionScopeIdentity } from "./local-files.js";
export { configuredReviewers } from "./reviewers.js";
export { learnFromService } from "./learning-service.js";
export { journeyCommand, journeyProgress, renderJourney } from "./journey-cli.js";
export { renderJourneyView, writeJourneyView, practiceStates } from "./journey-view.js";
export { checkRelease, compareReleaseVersions } from "./release-check.js";
export type { ReleaseCheckOptions, ReleaseCheckResult } from "./release-check.js";
export { coachCommand, parseWorkingPreferences, planCoaching, applyCoaching, rollbackCoaching, validateCoachPlan,
  CoachError, WORKING_PREFERENCES_SCHEMA, COACH_PLAN_SCHEMA, COACH_LIMITS } from "./coach.js";
export type { CoachPlan, WorkingPreferences, WorkingChoices, WorkingProfile } from "./coach.js";
