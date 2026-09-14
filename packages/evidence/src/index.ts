import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { canonicalize, ContractInputError, validateShareCandidate, type ShareCandidate } from "@better-loop/contracts";
import {
  scanCandidate, validateSemanticVerdict, SEMANTIC_REVIEW_INSTRUCTIONS,
  type Finding, type SemanticVerdict,
} from "@better-loop/privacy";

export const EVIDENCE_VERSION = "0.1.0-draft.2" as const;
export const CAPABILITY_SCHEMA_VERSION = "bl-capability-evidence-0.1" as const;
export const CONTRIBUTION_SCHEMA_VERSION = "bl-contribution-0.2" as const;
export const CONTRIBUTION_POLICY_VERSION = "bl-sharing-0.2" as const;
export const EVIDENCE_REVIEW_POLICY_VERSION = "bl-evidence-review-0.1" as const;
export const WORK_EVIDENCE_RUBRIC = "bl-work-evidence-0.1" as const;
export const MAX_CAPABILITY_BYTES = 4_096;
export const MAX_CONTRIBUTION_BYTES = 24_576;
export const HUMAN_ACTIONS = [
  "goal_definition", "approach_consultation", "iterative_refinement", "quality_examples",
  "output_structure", "collaboration_mode", "tone_preferences", "audience_definition",
  "context_gap_detection", "reasoning_scrutiny", "factual_verification",
] as const;
export const QUALITY_DIMENSIONS = [
  "correctness", "completeness", "reasoning", "verification", "reproducibility",
  "communication", "constraint_compliance",
] as const;
export type HumanAction = typeof HUMAN_ACTIONS[number];
export type QualityDimension = typeof QUALITY_DIMENSIONS[number];
export type CheckResult = "met" | "not_met" | "unknown";
export interface CapabilityEvidence {
  schema_version: typeof CAPABILITY_SCHEMA_VERSION;
  rubric_id: typeof WORK_EVIDENCE_RUBRIC;
  assessment_basis: "conversation_and_artifacts" | "conversation" | "artifacts_only" | "user_attestation" | "unknown";
  human_involvement: "human_directed" | "human_executed" | "agent_autonomous" | "mixed" | "unknown";
  human_actions: Array<{
    action: HumanAction;
    evidence: "selected_human_message" | "user_attestation" | "unknown";
    outcome_check: CheckResult;
  }>;
  quality_checks: Array<{
    dimension: QualityDimension;
    result: CheckResult;
    evaluator: "human" | "agent" | "tool" | "unknown";
    basis: "locally_recorded" | "self_reported" | "unknown";
  }>;
  change: "initial" | "followup" | "revision_only" | "unknown";
  distinct_task_band: "one" | "two_to_four" | "five_plus" | "unknown";
  benchmark: null | {
    id: "bl-public-approval-binding";
    version: "0.1";
    result: "met" | "not_met" | "incomplete";
    basis: "locally_recorded" | "self_reported";
  };
}
export interface ContributionConsent {
  public_story: true;
  benchmark_aggregation: boolean;
  community_learning: boolean;
  candidate_discovery: boolean;
  policy_version: typeof CONTRIBUTION_POLICY_VERSION;
}
export interface Contribution {
  schema_version: typeof CONTRIBUTION_SCHEMA_VERSION;
  candidate: ShareCandidate;
  capability_evidence: CapabilityEvidence;
}
export type EvidenceValidation<T> =
  | { valid: true; data: T }
  | { valid: false; errors: Finding[] };
export interface ContributionReviewerRequest {
  contribution: Contribution;
  policy_version: typeof EVIDENCE_REVIEW_POLICY_VERSION;
  instructions: string;
  signal: AbortSignal;
}
export interface ContributionReviewer {
  id: string;
  review(request: ContributionReviewerRequest): Promise<unknown>;
}
export interface ContributionReviewReceipt {
  reviewer: string;
  policy_version: typeof EVIDENCE_REVIEW_POLICY_VERSION;
  verdict: SemanticVerdict;
}
export type ContributionPreparation =
  | { state: "blocked"; findings: Finding[]; reviews: ContributionReviewReceipt[] }
  | {
    state: "ready_for_confirmation"; contribution: Contribution; consent: ContributionConsent;
    preview_digest: string; preview: string; reviews: ContributionReviewReceipt[];
    helper_version: typeof EVIDENCE_VERSION;
  };
export interface ContributionApproval {
  version: "bl-local-approval-0.2";
  contribution: Contribution;
  consent: ContributionConsent;
  preview_digest: string;
  helper_version: typeof EVIDENCE_VERSION;
  review_policy_version: typeof EVIDENCE_REVIEW_POLICY_VERSION;
}

export const EVIDENCE_REVIEW_INSTRUCTIONS = `${SEMANTIC_REVIEW_INSTRUCTIONS}
The input is now a contribution containing the minimized candidate and a controlled capability_evidence capsule. Review their combination. The capsule is self-reported evidence, even when marked locally_recorded or selected_human_message; it is not server attestation.
Check consistency across the human narrative, observed behaviors, human_involvement, quality checks, benchmark result and outcome. Agent-executed implementation/tests are not human judgment. Repo activity, Git authorship, version count and autonomous agent work cannot prove human actions.
An artifacts-only basis cannot observe a person's conversation. Missing evidence is unknown, not poor performance. A revision is not a new task or measured improvement; distinct_task_band alone proves neither repeatability nor transfer.
The public benchmark identifier names a task, not verified completion or calibrated human ability. Do not claim role fitness, superiority, certified competence or general benchmarking coverage. All useful neutral and negative results remain allowed.
Consider privacy from combinations of otherwise generic attributes as well as prose. No private paths, hashes, sources, names, company facts or work links belong in either part. Return the same strict verdict shape, without echoing content or adding fields.`;

const encoder = new TextEncoder();
const reviewed = new WeakMap<object, string>();
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const oneOf = (value: unknown, values: readonly string[]): value is string =>
  typeof value === "string" && values.includes(value);
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
function bad<T>(path: string, code: string): EvidenceValidation<T> {
  return { valid: false, errors: [{ path, code }] };
}
function snapshot(input: unknown, maxBytes: number): unknown {
  const text = canonicalize(input);
  if (encoder.encode(text).byteLength > maxBytes) throw new ContractInputError("too_large");
  return JSON.parse(text) as unknown;
}
function validateCapsuleData(value: unknown): EvidenceValidation<CapabilityEvidence> {
  if (!exact(value, ["schema_version", "rubric_id", "assessment_basis", "human_involvement",
    "human_actions", "quality_checks", "change", "distinct_task_band", "benchmark"]))
    return bad("", "invalid_capability_shape");
  if (value.schema_version !== CAPABILITY_SCHEMA_VERSION || value.rubric_id !== WORK_EVIDENCE_RUBRIC)
    return bad("", "unsupported_capability_version");
  if (!oneOf(value.assessment_basis, ["conversation_and_artifacts", "conversation", "artifacts_only", "user_attestation", "unknown"]) ||
      !oneOf(value.human_involvement, ["human_directed", "human_executed", "agent_autonomous", "mixed", "unknown"]) ||
      !oneOf(value.change, ["initial", "followup", "revision_only", "unknown"]) ||
      !oneOf(value.distinct_task_band, ["one", "two_to_four", "five_plus", "unknown"]))
    return bad("", "invalid_capability_value");
  if (!Array.isArray(value.human_actions) || value.human_actions.length > HUMAN_ACTIONS.length)
    return bad("/human_actions", "invalid_actions");
  const seenActions = new Set<string>();
  for (const [i, action] of value.human_actions.entries()) {
    const path = `/human_actions/${i}`;
    if (!exact(action, ["action", "evidence", "outcome_check"]) ||
        !oneOf(action.action, HUMAN_ACTIONS) ||
        !oneOf(action.evidence, ["selected_human_message", "user_attestation", "unknown"]) ||
        !oneOf(action.outcome_check, ["met", "not_met", "unknown"]))
      return bad(path, "invalid_action");
    if (seenActions.has(action.action)) return bad(path, "duplicate_action");
    seenActions.add(action.action);
    if (action.evidence === "selected_human_message" &&
        !["conversation_and_artifacts", "conversation"].includes(value.assessment_basis))
      return bad(path, "conversation_evidence_required");
    if (action.evidence === "unknown" && action.outcome_check !== "unknown")
      return bad(path, "missing_action_evidence");
    if (value.human_involvement === "agent_autonomous" && action.evidence !== "unknown")
      return bad(path, "autonomous_work_not_human_action");
    if (value.assessment_basis === "unknown" && action.evidence !== "unknown")
      return bad(path, "missing_assessment_basis");
  }
  if (!Array.isArray(value.quality_checks) || value.quality_checks.length > QUALITY_DIMENSIONS.length)
    return bad("/quality_checks", "invalid_checks");
  const seenChecks = new Set<string>();
  for (const [i, check] of value.quality_checks.entries()) {
    const path = `/quality_checks/${i}`;
    if (!exact(check, ["dimension", "result", "evaluator", "basis"]) ||
        !oneOf(check.dimension, QUALITY_DIMENSIONS) ||
        !oneOf(check.result, ["met", "not_met", "unknown"]) ||
        !oneOf(check.evaluator, ["human", "agent", "tool", "unknown"]) ||
        !oneOf(check.basis, ["locally_recorded", "self_reported", "unknown"]))
      return bad(path, "invalid_check");
    if (seenChecks.has(check.dimension)) return bad(path, "duplicate_check");
    seenChecks.add(check.dimension);
    if (check.result !== "unknown" && (check.evaluator === "unknown" || check.basis === "unknown"))
      return bad(path, "missing_quality_evidence");
    if (check.basis === "locally_recorded" &&
        !["conversation_and_artifacts", "conversation", "artifacts_only"].includes(value.assessment_basis))
      return bad(path, "local_evidence_basis_required");
  }
  if (value.benchmark !== null) {
    if (!exact(value.benchmark, ["id", "version", "result", "basis"]) ||
        value.benchmark.id !== "bl-public-approval-binding" || value.benchmark.version !== "0.1" ||
        !oneOf(value.benchmark.result, ["met", "not_met", "incomplete"]) ||
        !oneOf(value.benchmark.basis, ["locally_recorded", "self_reported"]))
      return bad("/benchmark", "invalid_benchmark");
    if (value.benchmark.basis === "locally_recorded" &&
        !["conversation_and_artifacts", "conversation", "artifacts_only"].includes(value.assessment_basis))
      return bad("/benchmark", "local_evidence_basis_required");
  }
  return { valid: true, data: value as unknown as CapabilityEvidence };
}
export function validateCapabilityEvidence(input: unknown): EvidenceValidation<CapabilityEvidence> {
  try { return validateCapsuleData(snapshot(input, MAX_CAPABILITY_BYTES)); }
  catch { return bad("", "invalid_capability_json_or_size"); }
}
export function validateContributionConsent(input: unknown): EvidenceValidation<ContributionConsent> {
  let value: unknown;
  try { value = snapshot(input, 1_024); } catch { return bad("/consent", "invalid_consent"); }
  if (!exact(value, ["public_story", "benchmark_aggregation", "community_learning", "candidate_discovery", "policy_version"]) ||
      value.public_story !== true || typeof value.benchmark_aggregation !== "boolean" ||
      typeof value.community_learning !== "boolean" || typeof value.candidate_discovery !== "boolean" ||
      value.policy_version !== CONTRIBUTION_POLICY_VERSION)
    return bad("/consent", "invalid_consent");
  return { valid: true, data: value as unknown as ContributionConsent };
}
export function validateContribution(input: unknown): EvidenceValidation<Contribution> {
  let value: unknown;
  try { value = snapshot(input, MAX_CONTRIBUTION_BYTES); }
  catch { return bad("", "invalid_contribution_json_or_size"); }
  if (!exact(value, ["schema_version", "candidate", "capability_evidence"]) ||
      value.schema_version !== CONTRIBUTION_SCHEMA_VERSION)
    return bad("", "invalid_contribution_shape_or_version");
  const candidate = validateShareCandidate(value.candidate);
  if (!candidate.valid) return { valid: false, errors: candidate.errors.map(error => ({ path: "/candidate" + error.path, code: error.code })) };
  if (encoder.encode(canonicalize(candidate.data)).byteLength > 16_384) return bad("/candidate", "too_large");
  const capsule = validateCapabilityEvidence(value.capability_evidence);
  if (!capsule.valid) return { valid: false, errors: capsule.errors.map(error => ({ path: "/capability_evidence" + error.path, code: error.code })) };
  const seenIndicators = new Set<string>();
  for (const item of candidate.data.human_behaviors) {
    if (seenIndicators.has(item.indicator)) return bad("/candidate/human_behaviors", "duplicate_indicator");
    seenIndicators.add(item.indicator);
  }
  for (const action of capsule.data.human_actions) {
    if (action.evidence === "selected_human_message" &&
        !candidate.data.human_behaviors.some(item => item.indicator === action.action && item.state === "observed"))
      return bad("/capability_evidence/human_actions", "observed_behavior_required");
  }
  // The two representations cannot contradict each other. Attestation stays a reported claim;
  // it does not manufacture an observed conversation in the candidate's behavioral assessment.
  for (const behavior of candidate.data.human_behaviors) {
    if (behavior.state === "observed" &&
        !capsule.data.human_actions.some(action =>
          action.action === behavior.indicator && action.evidence === "selected_human_message"))
      return bad("/candidate/human_behaviors", "observed_human_attribution_required");
  }
  if (capsule.data.human_involvement === "agent_autonomous" &&
      candidate.data.human_behaviors.some(item => item.state === "observed"))
    return bad("/candidate/human_behaviors", "autonomous_work_not_human_action");
  if (capsule.data.benchmark !== null &&
      (candidate.data.task.benchmark_contract !== "unregistered" || candidate.data.content_origin !== "work_derived"))
    return bad("/capability_evidence/benchmark", "benchmark_contract_conflict");
  return { valid: true, data: {
    schema_version: CONTRIBUTION_SCHEMA_VERSION, candidate: candidate.data, capability_evidence: capsule.data,
  } };
}
export function computeContributionDigest(input: unknown, purposes: unknown): string {
  const contribution = validateContribution(input);
  const consent = validateContributionConsent(purposes);
  if (!contribution.valid) throw new ContractInputError("invalid_contribution");
  if (!consent.valid) throw new ContractInputError("invalid_consent");
  return bytesToHex(sha256(encoder.encode(canonicalize({ contribution: contribution.data, consent: consent.data }))));
}
/** Structural validation is not local consent, semantic review or independent work verification. */
export function validateContributionApproval(input: unknown): EvidenceValidation<ContributionApproval> {
  let value: unknown;
  try { value = snapshot(input, MAX_CONTRIBUTION_BYTES + 2_048); }
  catch { return bad("", "invalid_approval_json_or_size"); }
  if (!exact(value, ["version", "contribution", "consent", "preview_digest", "helper_version", "review_policy_version"]) ||
      value.version !== "bl-local-approval-0.2" || value.helper_version !== EVIDENCE_VERSION ||
      value.review_policy_version !== EVIDENCE_REVIEW_POLICY_VERSION ||
      typeof value.preview_digest !== "string" || !/^[0-9a-f]{64}$/.test(value.preview_digest))
    return bad("", "invalid_approval");
  const contribution = validateContribution(value.contribution);
  if (!contribution.valid) return contribution;
  const consent = validateContributionConsent(value.consent);
  if (!consent.valid) return consent;
  if (computeContributionDigest(contribution.data, consent.data) !== value.preview_digest)
    return bad("/preview_digest", "digest_mismatch");
  return { valid: true, data: {
    version: "bl-local-approval-0.2", contribution: contribution.data, consent: consent.data,
    preview_digest: value.preview_digest, helper_version: EVIDENCE_VERSION, review_policy_version: EVIDENCE_REVIEW_POLICY_VERSION,
  } };
}
export function renderContributionPreview(input: Contribution, purposes: ContributionConsent): string {
  const contribution = validateContribution(input);
  const consent = validateContributionConsent(purposes);
  if (!contribution.valid || !consent.valid) throw new ContractInputError("invalid_contribution_preview");
  return [
    "Better Loop — exact local contribution preview", "Recipient: better-loop.com",
    "No upload has occurred. Publication is optional. Review may use your configured model provider.",
    "The summary excludes source work, transcripts, identities, private paths, business metrics and local evidence hashes.",
    "Human contribution, quality and evidence coverage are separate. Local recording is not independent work verification.",
    "Candidate discovery helps readers inspect relevant evidence; it does not establish role fitness.",
    "An edited story is not a new task or measured improvement. Normalized metrics describe the stated comparison only.",
    `Public story: yes; benchmark aggregation: ${consent.data.benchmark_aggregation}; automated community learning: ${consent.data.community_learning}; candidate discovery: ${consent.data.candidate_discovery}`,
    `Policy: ${CONTRIBUTION_POLICY_VERSION}; preview digest: ${computeContributionDigest(contribution.data, consent.data)}`,
    "Review every field below. Any content or purpose change requires another review and exact confirmation.",
    JSON.stringify(contribution.data, null, 2),
  ].join("\n\n");
}
async function runReviewer(reviewer: ContributionReviewer, contribution: Contribution, timeoutMs: number): Promise<SemanticVerdict | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      new Promise<null>(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs); }),
      Promise.resolve().then(() => reviewer.review({
        contribution: JSON.parse(canonicalize(contribution)) as Contribution,
        policy_version: EVIDENCE_REVIEW_POLICY_VERSION,
        instructions: EVIDENCE_REVIEW_INSTRUCTIONS, signal: controller.signal,
      })).then(validateSemanticVerdict, () => null),
    ]);
  } finally { if (timer) clearTimeout(timer); controller.abort(); }
}
export async function prepareContribution(
  input: unknown, purposes: ContributionConsent, reviewers: ContributionReviewer[],
  options: { timeoutMs?: number } = {},
): Promise<ContributionPreparation> {
  const contribution = validateContribution(input);
  if (!contribution.valid) return { state: "blocked", findings: contribution.errors, reviews: [] };
  const consent = validateContributionConsent(purposes);
  if (!consent.valid) return { state: "blocked", findings: consent.errors, reviews: [] };
  const scanned = scanCandidate(contribution.data.candidate);
  if (!scanned.valid) return { state: "blocked", findings: scanned.findings.map(f => ({ path: "/candidate" + f.path, code: f.code })), reviews: [] };
  if (!Array.isArray(reviewers) || reviewers.length !== 2 ||
      reviewers.some(r => !r || typeof r.id !== "string" || !/^[a-z][a-z0-9_-]{0,39}$/.test(r.id) || typeof r.review !== "function") ||
      new Set(reviewers.map(r => r.id)).size !== 2)
    return { state: "blocked", findings: [{ path: "", code: "two_reviewers_required" }], reviews: [] };
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new ContractInputError("invalid_review_timeout");
  // Detach configuration and method references as well as data before starting asynchronous work.
  const passes = reviewers.map(reviewer => ({ id: reviewer.id, review: reviewer.review.bind(reviewer) }));
  const digest = computeContributionDigest(contribution.data, consent.data);
  const verdicts = await Promise.all(passes.map(reviewer => runReviewer(reviewer, contribution.data, timeoutMs)));
  const receipts: ContributionReviewReceipt[] = [];
  const findings: Finding[] = [];
  verdicts.forEach((verdict, index) => {
    if (!verdict) findings.push({ path: "", code: "semantic_review_unavailable" });
    else {
      receipts.push({ reviewer: passes[index]!.id, policy_version: EVIDENCE_REVIEW_POLICY_VERSION, verdict });
      if (verdict.verdict !== "allow") findings.push({ path: "", code: "semantic_review_blocked" });
    }
  });
  if (findings.length) return { state: "blocked", findings, reviews: receipts };
  const prepared: ContributionPreparation = {
    state: "ready_for_confirmation", contribution: contribution.data, consent: consent.data,
    preview_digest: digest, preview: renderContributionPreview(contribution.data, consent.data),
    reviews: receipts, helper_version: EVIDENCE_VERSION,
  };
  reviewed.set(prepared, canonicalize(prepared));
  return prepared;
}
/** Returns a detached local receipt. A later browser still requires explicit publication and server review. */
export function confirmContribution(prepared: ContributionPreparation, exactDigest: string, confirmed: true): ContributionApproval {
  const original = reviewed.get(prepared);
  let unchanged = false;
  try { unchanged = original !== undefined && canonicalize(prepared) === original; } catch { /* Fail closed on changed non-JSON state. */ }
  if (!unchanged || confirmed !== true || prepared.state !== "ready_for_confirmation" ||
      prepared.preview_digest !== exactDigest || computeContributionDigest(prepared.contribution, prepared.consent) !== exactDigest)
    throw new ContractInputError("fresh_preview_confirmation_required");
  return {
    version: "bl-local-approval-0.2",
    contribution: JSON.parse(canonicalize(prepared.contribution)) as Contribution,
    consent: JSON.parse(canonicalize(prepared.consent)) as ContributionConsent,
    preview_digest: exactDigest, helper_version: EVIDENCE_VERSION, review_policy_version: EVIDENCE_REVIEW_POLICY_VERSION,
  };
}
