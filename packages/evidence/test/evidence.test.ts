import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { canonicalize, computePreviewDigest } from "@better-loop/contracts";
import type { SemanticVerdict } from "@better-loop/privacy";
import {
  validateCapabilityEvidence, validateContribution, validateContributionConsent, validateContributionApproval,
  computeContributionDigest, prepareContribution, confirmContribution, renderContributionPreview,
  type CapabilityEvidence, type Contribution, type ContributionConsent, type ContributionReviewer,
} from "../src/index.js";

const consent = (): ContributionConsent => ({
  public_story: true, benchmark_aggregation: false, community_learning: false,
  candidate_discovery: false, policy_version: "bl-sharing-0.2",
});
const capsule = (): CapabilityEvidence => ({
  schema_version: "bl-capability-evidence-0.1", rubric_id: "bl-work-evidence-0.1",
  assessment_basis: "conversation_and_artifacts", human_involvement: "human_directed",
  human_actions: [{ action: "goal_definition", evidence: "selected_human_message", outcome_check: "unknown" }],
  quality_checks: [{ dimension: "verification", result: "met", evaluator: "tool", basis: "locally_recorded" }],
  change: "initial", distinct_task_band: "one", benchmark: null,
});
const contribution = (): Contribution => {
  const candidate = JSON.parse(readFileSync(new URL("../../../examples/software-story.synthetic.json", import.meta.url), "utf8"));
  candidate.human_behaviors = [{ indicator: "goal_definition", state: "observed", rating: null,
    evidence_summary: "The person specified an acceptance check before the agent implemented the change." }];
  return { schema_version: "bl-contribution-0.2", candidate, capability_evidence: capsule() };
};
const allow: SemanticVerdict = {
  verdict: "allow", confidentiality: "clear", claim_support: "consistent", usefulness: "useful", reasons: [],
};
const pass = (id: string, result: unknown = allow): ContributionReviewer => ({ id, review: async () => result });
const pair = () => [pass("disclosure"), pass("claims")];

test("valid minimized fields are detached, both claim and unknown outcomes remain representable", () => {
  const input = contribution();
  const validated = validateContribution(input);
  assert.equal(validated.valid, true);
  if (!validated.valid) assert.fail();
  input.capability_evidence.quality_checks[0]!.result = "not_met";
  assert.equal(validated.data.capability_evidence.quality_checks[0]!.result, "met");
  for (const change of ["initial", "followup", "revision_only", "unknown"] as const) {
    const record = contribution(); record.capability_evidence.change = change;
    assert.equal(validateContribution(record).valid, true);
  }
  for (const result of ["met", "not_met", "unknown"] as const) {
    const record = capsule(); record.quality_checks[0]!.result = result;
    assert.equal(validateCapabilityEvidence(record).valid, true);
  }
});
test("all-unknown capsule carries no invented measurements or judgments", () => {
  const record: CapabilityEvidence = { ...capsule(), assessment_basis: "unknown", human_involvement: "unknown",
    human_actions: [], quality_checks: [], change: "unknown", distinct_task_band: "unknown" };
  assert.equal(validateCapabilityEvidence(record).valid, true);
});
test("capsule rejects every unknown field and arbitrary source identifiers", () => {
  for (const key of ["name", "email", "repository", "private_hash", "source_path", "employer", "project", "timestamp", "score", "verified"]) {
    assert.equal(validateCapabilityEvidence({ ...capsule(), [key]: "test-only private value" }).valid, false);
  }
  for (const layer of ["human_actions", "quality_checks"] as const) {
    const record = capsule();
    Object.assign(record[layer][0]!, { private_source: "test-only private value" });
    assert.equal(validateCapabilityEvidence(record).valid, false);
  }
  const record = capsule(); record.benchmark = { id: "private-benchmark", version: "0.1", result: "met", basis: "self_reported" } as never;
  assert.equal(validateCapabilityEvidence(record).valid, false);
});
test("closed vocabularies reject coerced, future and malformed values", () => {
  for (const key of ["schema_version", "rubric_id", "assessment_basis", "human_involvement", "change", "distinct_task_band"] as const) {
    for (const value of [null, [capsule()[key]], 1, true, {}, "future"]) {
      assert.equal(validateCapabilityEvidence({ ...capsule(), [key]: value }).valid, false, key);
    }
  }
  for (const record of [null, [], "capsule", { ...capsule(), human_actions: null }, { ...capsule(), quality_checks: {} }]) {
    assert.equal(validateCapabilityEvidence(record).valid, false);
  }
});
test("duplicate action, quality dimension and candidate indicator are rejected", () => {
  const actions = capsule(); actions.human_actions.push({ ...actions.human_actions[0]! });
  assert.equal(validateCapabilityEvidence(actions).valid, false);
  const checks = capsule(); checks.quality_checks.push({ ...checks.quality_checks[0]! });
  assert.equal(validateCapabilityEvidence(checks).valid, false);
  const record = contribution(); record.candidate.human_behaviors.push({ ...record.candidate.human_behaviors[0]! });
  assert.equal(validateContribution(record).valid, false);
});
test("artifacts, attestation and unknown scope cannot observe a human conversation", () => {
  for (const basis of ["artifacts_only", "user_attestation", "unknown"] as const) {
    const record = capsule(); record.assessment_basis = basis;
    assert.equal(validateCapabilityEvidence(record).valid, false);
  }
  const attested = capsule(); attested.assessment_basis = "user_attestation";
  attested.human_actions[0]!.evidence = "user_attestation"; attested.quality_checks[0]!.basis = "self_reported";
  assert.equal(validateCapabilityEvidence(attested).valid, true);
});
test("autonomous agent work never establishes observed human actions", () => {
  const record = contribution(); record.capability_evidence.human_involvement = "agent_autonomous";
  assert.equal(validateContribution(record).valid, false);
  record.capability_evidence.human_actions = [];
  assert.equal(validateContribution(record).valid, false);
  record.candidate.human_behaviors[0]!.state = "insufficient_evidence";
  assert.equal(validateContribution(record).valid, true);
});
test("selected-human-message evidence requires the corresponding observed indicator", () => {
  for (const state of ["not_observed", "not_applicable", "insufficient_evidence"] as const) {
    const record = contribution(); record.candidate.human_behaviors[0]!.state = state;
    assert.equal(validateContribution(record).valid, false);
  }
  const empty = contribution(); empty.candidate.human_behaviors = [];
  assert.equal(validateContribution(empty).valid, false);
});
test("observed candidate behavior cannot be supported by unknown, absent or artifact-only attribution", async () => {
  const unknownAction = contribution(); unknownAction.capability_evidence.human_actions[0]!.evidence = "unknown";
  const missingAction = contribution(); missingAction.capability_evidence.human_actions = [];
  const artifactsOnly = contribution(); artifactsOnly.capability_evidence.assessment_basis = "artifacts_only"; artifactsOnly.capability_evidence.human_actions = [];
  const unknownBasis = contribution(); unknownBasis.capability_evidence.assessment_basis = "unknown";
  unknownBasis.capability_evidence.human_actions = []; unknownBasis.capability_evidence.quality_checks = [];
  for (const record of [unknownAction, missingAction, artifactsOnly, unknownBasis]) {
    assert.equal(validateCapabilityEvidence(record.capability_evidence).valid, true);
    const result = validateContribution(record);
    assert.equal(result.valid, false);
    if (result.valid) assert.fail();
    assert.equal(result.errors[0]!.code, "observed_human_attribution_required");
    let calls = 0;
    const preparation = await prepareContribution(record, consent(), [
      { id: "one", review: async () => { calls++; return allow; } }, pass("two"),
    ]);
    assert.equal(preparation.state, "blocked"); assert.equal(calls, 0);
    record.candidate.human_behaviors[0]!.state = "insufficient_evidence";
    assert.equal(validateContribution(record).valid, true);
  }
});
test("user attestation preserves missing observation and null rating without an observed-state upgrade", async () => {
  for (const state of ["insufficient_evidence", "not_observed"] as const) {
    const record = contribution();
    record.capability_evidence.assessment_basis = "user_attestation";
    record.capability_evidence.human_actions[0]!.evidence = "user_attestation";
    record.capability_evidence.quality_checks = [];
    record.candidate.human_behaviors[0]!.state = state;
    record.candidate.human_behaviors[0]!.rating = null;
    record.candidate.human_behaviors[0]!.evidence_summary = "The contributor reports setting an acceptance check; no selected conversation was available.";
    assert.equal(validateContribution(record).valid, true);
    const prepared = await prepareContribution(record, consent(), pair());
    if (prepared.state !== "ready_for_confirmation") assert.fail();
    const approval = confirmContribution(prepared, prepared.preview_digest, true);
    assert.equal(approval.contribution.candidate.human_behaviors[0]!.state, state);
    assert.equal(approval.contribution.candidate.human_behaviors[0]!.rating, null);
    assert.equal(approval.contribution.capability_evidence.human_actions[0]!.evidence, "user_attestation");
    record.candidate.human_behaviors[0]!.state = "observed";
    assert.equal(validateContribution(record).valid, false);
  }
  const capsuleOnlyClaim = contribution();
  capsuleOnlyClaim.capability_evidence.assessment_basis = "user_attestation";
  capsuleOnlyClaim.capability_evidence.human_actions[0]!.evidence = "user_attestation";
  capsuleOnlyClaim.capability_evidence.quality_checks = [];
  capsuleOnlyClaim.candidate.human_behaviors = [];
  assert.equal(validateContribution(capsuleOnlyClaim).valid, true);
});
test("missing evidence cannot become an outcome check or recorded quality", () => {
  const human = capsule(); human.human_actions[0]!.evidence = "unknown"; human.human_actions[0]!.outcome_check = "met";
  assert.equal(validateCapabilityEvidence(human).valid, false);
  for (const key of ["evaluator", "basis"] as const) {
    const record = capsule(); record.quality_checks[0]![key] = "unknown";
    assert.equal(validateCapabilityEvidence(record).valid, false);
    record.quality_checks[0]!.result = "unknown";
    assert.equal(validateCapabilityEvidence(record).valid, true);
  }
  const attested = capsule(); attested.assessment_basis = "user_attestation"; attested.human_actions = [];
  assert.equal(validateCapabilityEvidence(attested).valid, false);
});
test("benchmark registry and legacy contract remain separate; fixture origin cannot claim public-work benchmark", () => {
  const record = contribution();
  record.capability_evidence.benchmark = { id: "bl-public-approval-binding", version: "0.1", result: "not_met", basis: "locally_recorded" };
  assert.equal(validateContribution(record).valid, false);
  record.candidate.content_origin = "work_derived";
  record.candidate.task.benchmark_contract = "unregistered";
  assert.equal(validateContribution(record).valid, true);
  record.candidate.task.benchmark_contract = "synthetic-code-checks-0.1";
  assert.equal(validateContribution(record).valid, false);
  record.candidate.task.benchmark_contract = "unregistered";
  Object.assign(record.capability_evidence.benchmark, { independently_verified: true });
  assert.equal(validateContribution(record).valid, false);
});
test("validators reject getters, oversized data, cycles and non-JSON values without executing getters", () => {
  let invoked = false;
  const record = capsule();
  Object.defineProperty(record, "change", { enumerable: true, get() { invoked = true; return "initial"; } });
  assert.equal(validateCapabilityEvidence(record).valid, false);
  assert.equal(invoked, false);
  for (const input of [
    { ...capsule(), extra: "x".repeat(5000) }, { ...capsule(), human_actions: new Array(11) },
    { ...capsule(), change: undefined }, { ...capsule(), change: NaN },
  ]) assert.equal(validateCapabilityEvidence(input).valid, false);
  const cyclic = { ...capsule(), cycle: {} }; cyclic.cycle = cyclic;
  assert.equal(validateCapabilityEvidence(cyclic).valid, false);
  assert.equal(validateContribution({ ...contribution(), raw: "x".repeat(30_000) }).valid, false);
  const whole = contribution();
  for (const key of ["problem", "change", "result", "lesson", "limits"] as const) whole.candidate.story[key] = "界".repeat(800);
  whole.candidate.human_behaviors = Array.from({ length: 11 }, () => ({ ...whole.candidate.human_behaviors[0]!, evidence_summary: "界".repeat(240) }));
  assert.equal(validateContribution(whole).valid, false);
});
test("strict contribution and consent shapes do not accept legacy policies or unnoticed purposes", () => {
  for (const input of [null, contribution().candidate, { ...contribution(), raw_work: "private" },
    { ...contribution(), schema_version: "bl-contribution-0.3" }]) assert.equal(validateContribution(input).valid, false);
  for (const input of [null, { ...consent(), policy_version: "bl-sharing-0.1" }, { ...consent(), public_story: false },
    { ...consent(), model_training: true }, { ...consent(), candidate_discovery: undefined }, { ...consent(), candidate_discovery: 1 }]) {
    assert.equal(validateContributionConsent(input).valid, false);
    assert.throws(() => computeContributionDigest(contribution(), input), /invalid_consent/);
  }
});
test("canonical digest equals an independent SHA-256 implementation and binds every purpose", () => {
  const record = contribution(), purposes = consent();
  const expected = createHash("sha256").update(canonicalize({ contribution: record, consent: purposes })).digest("hex");
  assert.equal(computeContributionDigest(record, purposes), expected);
  for (const key of ["benchmark_aggregation", "community_learning", "candidate_discovery"] as const) {
    assert.notEqual(computeContributionDigest(record, { ...purposes, [key]: true }), expected);
  }
  const changed = contribution(); changed.capability_evidence.change = "followup";
  assert.notEqual(computeContributionDigest(changed, purposes), expected);
  const legacy = { public_story: true as const, benchmark_aggregation: false, community_learning: false, policy_version: "bl-sharing-0.1" as const };
  assert.notEqual(computePreviewDigest(record.candidate, legacy), expected);
});
test("privacy scanning blocks unsafe prose before any semantic reviewer receives data", async () => {
  const record = contribution(); record.candidate.story.lesson = "Contact fictional.person@example.test";
  let calls = 0;
  const result = await prepareContribution(record, consent(), [
    { id: "first", review: async () => { calls++; return allow; } }, pass("second"),
  ]);
  assert.equal(result.state, "blocked"); assert.equal(calls, 0);
});
test("two independent calls receive the complete detached contribution and new review instructions", async () => {
  const record = contribution(); const purposes = consent();
  const requests: Contribution[] = [];
  const reviewers = ["disclosure", "claims"].map(id => ({
    id, review: async (request: Parameters<ContributionReviewer["review"]>[0]) => {
      assert.equal(request.policy_version, "bl-evidence-review-0.1");
      assert.match(request.instructions, /Agent-executed implementation/);
      assert.deepEqual(request.contribution, record);
      requests.push(request.contribution);
      return allow;
    },
  }));
  const result = await prepareContribution(record, purposes, reviewers);
  assert.equal(result.state, "ready_for_confirmation");
  assert.equal(requests.length, 2);
  assert.notEqual(requests[0], requests[1]); assert.notEqual(requests[0], record);
});
test("review unavailability, uncertainty, disagreement and malformed configuration block", async () => {
  for (const reviewers of [
    null, [], [pass("one")], [pass("one"), pass("one")], [null, null],
    [pass("one"), pass("two", { ...allow, extra: "content" })],
    [pass("one"), pass("two", { ...allow, confidentiality: "uncertain" })],
    [pass("one"), pass("two", { ...allow, verdict: "block", reasons: ["unsupported_claim"] })],
    [pass("one"), { id: "two", review: async () => { throw new Error("provider unavailable"); } }],
  ]) {
    assert.equal((await prepareContribution(contribution(), consent(), reviewers as never)).state, "blocked");
  }
});
test("timeouts abort the provider, reject invalid budgets and never approve late output", async () => {
  let aborted = false;
  const hung: ContributionReviewer = { id: "hung", review: async ({ signal }) => {
    signal.addEventListener("abort", () => { aborted = true; });
    return new Promise(() => {});
  } };
  const result = await prepareContribution(contribution(), consent(), [pass("one"), hung], { timeoutMs: 5 });
  assert.equal(result.state, "blocked"); assert.equal(aborted, true);
  for (const timeoutMs of [0, -1, 120_001, Infinity, 1.2]) {
    await assert.rejects(prepareContribution(contribution(), consent(), pair(), { timeoutMs }), /invalid_review_timeout/);
  }
});
test("mutations during review do not change data, purpose or reviewer configuration snapshots", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const record = contribution(); const purposes = consent();
  const reviewers = [
    { id: "one", review: async () => { await gate; return allow; } },
    { id: "two", review: async (request: Parameters<ContributionReviewer["review"]>[0]) => {
      request.contribution.capability_evidence.change = "followup"; return allow;
    } },
  ];
  const promise = prepareContribution(record, purposes, reviewers);
  record.capability_evidence.change = "revision_only"; purposes.candidate_discovery = true;
  reviewers[0]!.id = "replaced"; reviewers[1]!.review = async () => null as never;
  release();
  const prepared = await promise;
  if (prepared.state !== "ready_for_confirmation") assert.fail();
  assert.equal(prepared.contribution.capability_evidence.change, "initial");
  assert.equal(prepared.consent.candidate_discovery, false);
  assert.deepEqual(prepared.reviews.map(item => item.reviewer), ["one", "two"]);
  assert.ok(confirmContribution(prepared, prepared.preview_digest, true));
});
test("exact preview includes every contribution field and all purposes; approval is detached", async () => {
  const prepared = await prepareContribution(contribution(), consent(), pair());
  if (prepared.state !== "ready_for_confirmation") assert.fail();
  assert.ok(prepared.preview.includes(JSON.stringify(prepared.contribution, null, 2)));
  assert.match(prepared.preview, /candidate discovery: false/);
  assert.match(prepared.preview, /No upload has occurred/);
  assert.equal(prepared.preview, renderContributionPreview(prepared.contribution, prepared.consent));
  const approval = confirmContribution(prepared, prepared.preview_digest, true);
  assert.equal(validateContributionApproval(approval).valid, true);
  assert.equal(validateContributionApproval(JSON.parse(JSON.stringify(approval))).valid, true);
  prepared.contribution.capability_evidence.change = "followup";
  assert.equal(approval.contribution.capability_evidence.change, "initial");
});
test("edited bytes, purposes, preview, receipts, or helper version cannot reuse review even with recomputed digest", async () => {
  const edits = [
    (p: any) => { p.contribution.candidate.story.lesson = "Use an explicit acceptance check."; },
    (p: any) => { p.contribution.capability_evidence.change = "followup"; },
    (p: any) => { p.consent.candidate_discovery = true; },
    (p: any) => { p.consent.community_learning = true; },
    (p: any) => { p.consent.benchmark_aggregation = true; },
    (p: any) => { p.preview = "different"; },
    (p: any) => { p.reviews = []; },
    (p: any) => { p.helper_version = "future"; },
  ];
  for (const edit of edits) {
    const prepared = await prepareContribution(contribution(), consent(), pair());
    if (prepared.state !== "ready_for_confirmation") assert.fail();
    edit(prepared);
    prepared.preview_digest = computeContributionDigest(prepared.contribution, prepared.consent);
    assert.throws(() => confirmContribution(prepared, prepared.preview_digest, true), /fresh_preview_confirmation_required/);
  }
});
test("serialized, cloned or fabricated preparations do not count as actual review or approval", async () => {
  const prepared = await prepareContribution(contribution(), consent(), pair());
  if (prepared.state !== "ready_for_confirmation") assert.fail();
  for (const copy of [JSON.parse(JSON.stringify(prepared)), { ...prepared }, new Proxy(prepared, {})]) {
    assert.throws(() => confirmContribution(copy, prepared.preview_digest, true), /fresh_preview_confirmation_required/);
  }
  assert.throws(() => confirmContribution(prepared, prepared.preview_digest, false as never), /fresh_preview_confirmation_required/);
  assert.throws(() => confirmContribution(prepared, "0".repeat(64), true), /fresh_preview_confirmation_required/);
  assert.ok(confirmContribution(prepared, prepared.preview_digest, true));
});
test("approval transport validation rejects changed digest/content/purposes and unknown fields", async () => {
  const prepared = await prepareContribution(contribution(), consent(), pair());
  if (prepared.state !== "ready_for_confirmation") assert.fail();
  const approval = confirmContribution(prepared, prepared.preview_digest, true);
  for (const altered of [
    { ...approval, consent: { ...approval.consent, candidate_discovery: true } },
    { ...approval, contribution: { ...approval.contribution, capability_evidence: { ...capsule(), change: "followup" } } },
    { ...approval, helper_version: "future" }, { ...approval, helper_version: "0.1.0-draft.1" },
    { ...approval, version: "bl-local-approval-0.1" },
    { ...approval, review_policy_version: "bl-review-0.1" }, { ...approval, preview_digest: "0".repeat(64) },
    { ...approval, verified: true }, { ...approval, raw_work: "private" },
  ]) assert.equal(validateContributionApproval(altered).valid, false);
  // Recomputing a transport digest does not establish review: only prepare+confirm issues a local approval.
  const changed = { ...approval, consent: { ...approval.consent, candidate_discovery: true } };
  changed.preview_digest = computeContributionDigest(changed.contribution, changed.consent);
  assert.equal(validateContributionApproval(changed).valid, true);
  assert.throws(() => confirmContribution(changed as never, changed.preview_digest, true), /fresh_preview_confirmation_required/);
});
