import { adapterCapabilities } from "@better-loop/adapters";
import { CONTRACT_PACKAGE_VERSION } from "@better-loop/contracts";
import { PRIVACY_VERSION, REVIEW_POLICY_VERSION } from "@better-loop/privacy";
import { MEASUREMENT_VERSION } from "@better-loop/measurement";

export const CLI_VERSION = "0.2.0-draft.1" as const;
export function capabilities() {
  return {
    protocol: "bl-capabilities-0.2", helper_version: CLI_VERSION,
    packages: { contracts: CONTRACT_PACKAGE_VERSION, core: CLI_VERSION, adapters: CLI_VERSION, privacy: PRIVACY_VERSION, measurement: "0.1.0-draft.1" },
    capabilities: {
      selected_assessment: true, explicit_artifact_capture: true, descriptive_indicators: 11, calibrated_ranking: false,
      prompt_rewrite: true, static_skill_audit: true, scoped_instruction_plan_apply_rollback: true,
      candidate_scan: true, reviewed_candidate_preview: true, exact_local_confirmation: true,
      semantic_review: "requires_two_explicit_configured_reviewers",
      semantic_review_policy: REVIEW_POLICY_VERSION, upload: false, identity: false,
      local_measurement: MEASUREMENT_VERSION, local_milestones: true,
      local_learning: "fresh_eligible_public_response_only",
      live_learning_endpoint: "explicit_service_only_no_default",
    },
    adapters: adapterCapabilities(),
    boundaries: {
      default_network: false, raw_evidence_upload: false, history_scan: false,
      provider: "Only explicitly configured semantic reviewer commands may use their own provider connection; they receive the minimized candidate.",
      learning_service: "Only explicit service requests use GET with controlled taxonomy and no auth, cookies, private task text, or evidence.",
    },
  };
}
export { planInstructionChange, applyInstructionChange, readSelectedFile, writePrivateOutput } from "./local-files.js";
export { configuredReviewers } from "./reviewers.js";
export { learnFromService } from "./learning-service.js";
