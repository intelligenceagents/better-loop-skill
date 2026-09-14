import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { canonicalize } from "@better-loop/contracts";
import { METHODOLOGY_VERSION } from "@better-loop/core";
import type { Host, TaskContext } from "@better-loop/core";
import { collectRepositories, descendsFrom, excludedPath, selectRoots } from "./collector.js";
import { activeRecommendation, sameRecommendation, snapshotEvidence } from "./coaching.js";
import { renderDeltaExcerpt } from "./diff.js";
import { diagnoseDelta } from "./diagnosis.js";
import type { FollowupCheck, RecommendationOutcomeStatus } from "./diagnosis.js";
import { directory, fail, hash, readBounded, selectedPath } from "./safety.js";
import {
  commitCheckpoint, createStorage, forgetStorage, inspectLock, nextCheckpoint,
  readHistory, recoverLock, removeOldRecords, validateFollowupCheck, validateHostAssessment, validateRecordDirectory, validateTask, withLock,
} from "./store.js";
import { COLLECTION_POLICY, JOURNEY_SCHEMA, LIMITS } from "./types.js";
import type { HostAssessmentInput, JourneyCheckpoint, JourneyChange, JourneyUseResult, RepositorySnapshot, StoredJourney } from "./types.js";

export * from "./types.js";
export * from "./diagnosis.js";
export { activeRecommendation } from "./coaching.js";

function expected(current: StoredJourney, checkpoint: string): void {
  if (checkpoint !== current.checkpoint.checkpoint_id) fail("stale_checkpoint");
}
function summary(stored: StoredJourney) {
  const checkpoint = stored.checkpoint;
  return {
    classification: "private_local_journey_not_export" as const,
    checkpoint_id: checkpoint.checkpoint_id, sequence: checkpoint.sequence,
    created_at: checkpoint.created_at, event: checkpoint.event, scope: checkpoint.scope,
    assessment: checkpoint.assessment, host_assessment: checkpoint.host_assessment, outcomes: checkpoint.outcomes,
    invalidation_reasons: checkpoint.invalidation_reasons,
    repositories: checkpoint.snapshots?.map(snapshot => ({
      root: snapshot.root, eligible_files: snapshot.files.length,
      unavailable_files: snapshot.unavailable.length, excluded: snapshot.excluded,
    })) ?? null,
  };
}
export async function createScope(input: { stateDirectory: string; roots: string[]; task: TaskContext }) {
  const path = selectedPath(input.stateDirectory);
  const task = validateTask(input.task);
  const roots = await selectRoots(input.roots);
  if (roots.some(root => path === root.path || root.path.startsWith(path + "/"))) fail("state_must_be_dedicated_directory");
  const scopeId = randomUUID();
  await createStorage(path, scopeId);
  const checkpoint: JourneyCheckpoint = {
    schema_version: JOURNEY_SCHEMA, checkpoint_id: randomUUID(), sequence: 1,
    previous_digest: null, previous_checkpoint: null, created_at: new Date().toISOString(), event: "created",
    scope: { scope_id: scopeId, revision: 1, roots, task, framework_version: METHODOLOGY_VERSION, collection_policy: COLLECTION_POLICY },
    snapshots: null, assessment: null, host_assessment: null, outcomes: [], invalidation_reasons: [],
  };
  return withLock(path, async () => summary(await commitCheckpoint(path, checkpoint, null)));
}
export async function inspectJourney(stateDirectory: string, options: { includeEvidence?: boolean } = {}) {
  const path = selectedPath(stateDirectory);
  const records = await readHistory(path);
  return {
    ...summary(records[0]!), lock: await inspectLock(path),
    ...(options.includeEvidence ? { local_evidence: records[0]!.checkpoint.snapshots } : {}),
  };
}
export async function history(stateDirectory: string) {
  return (await readHistory(selectedPath(stateDirectory))).map(summary);
}
export async function updateScope(input: { stateDirectory: string; expectedCheckpoint: string; roots: string[]; task: TaskContext }) {
  const path = selectedPath(input.stateDirectory);
  const roots = await selectRoots(input.roots);
  const task = validateTask(input.task);
  if (roots.some(root => path === root.path || root.path.startsWith(path + "/"))) fail("state_must_be_dedicated_directory");
  return withLock(path, async () => {
    const current = (await readHistory(path))[0]!;
    expected(current, input.expectedCheckpoint);
    if (canonicalize({ roots, task }) === canonicalize({ roots: current.checkpoint.scope.roots, task: current.checkpoint.scope.task })) return summary(current);
    const next = nextCheckpoint(current);
    next.event = "scope_updated";
    next.scope = { ...next.scope, roots, task, revision: next.scope.revision + 1, framework_version: METHODOLOGY_VERSION, collection_policy: COLLECTION_POLICY };
    next.snapshots = null; next.assessment = null; next.host_assessment = null; next.outcomes = [];
    next.invalidation_reasons = ["scope_changed"];
    return summary(await commitCheckpoint(path, next, current));
  });
}
function changes(before: RepositorySnapshot[] | null, after: RepositorySnapshot[]): JourneyChange[] {
  const result: JourneyChange[] = [];
  for (const [repository, snapshot] of after.entries()) {
    const prior = before?.find(item => item.root === snapshot.root);
    const earlier = new Map(prior?.files.map(file => [file.path, file]) ?? []);
    const later = new Map(snapshot.files.map(file => [file.path, file]));
    for (const path of [...new Set([...earlier.keys(), ...later.keys()])].sort()) {
      const a = earlier.get(path), b = later.get(path);
      if (a?.hash === b?.hash) continue;
      const status = b ? a ? "modified" : "added" : snapshot.unavailable.includes(path) ? "unavailable" : "deleted";
      result.push({
        id: `repository-${repository + 1}/change-${result.length + 1}`, repository,
        path, status, before: a?.text ?? null, after: b?.text ?? null,
        excerpt: "", excerpt_truncated: false, excerpt_format: "unified_hunks", omitted_hunks: 0,
      });
    }
  }
  return result;
}
export async function useJourney(input: {
  stateDirectory: string; host: Host; expectedCheckpoint?: string;
  excerptBytes?: number; excerptFiles?: number; excerptPaths?: string[];
}): Promise<JourneyUseResult> {
  const path = selectedPath(input.stateDirectory);
  if (!["claude_code", "codex"].includes(input.host)) fail("unsupported_host");
  const byteBudget = input.excerptBytes ?? 8192, fileBudget = input.excerptFiles ?? 8;
  if (!Number.isInteger(byteBudget) || byteBudget < 0 || byteBudget > LIMITS.excerptBytes ||
      !Number.isInteger(fileBudget) || fileBudget < 1 || fileBudget > 40 ||
      (input.excerptPaths !== undefined && (!Array.isArray(input.excerptPaths) || input.excerptPaths.length > 40 ||
        input.excerptPaths.some(path => typeof path !== "string" || path.length > 4096)))) fail("invalid_excerpt_selection");
  return withLock(path, async () => {
    const current = (await readHistory(path))[0]!;
    if (input.expectedCheckpoint !== undefined) expected(current, input.expectedCheckpoint);
    const before = current.checkpoint;
    const snapshots = await collectRepositories(before.scope.roots, path);
    const reasons: string[] = before.snapshots === null ? [...before.invalidation_reasons] : [];
    if (before.scope.framework_version !== METHODOLOGY_VERSION) reasons.push("framework_changed");
    if (before.scope.collection_policy !== COLLECTION_POLICY) reasons.push("collection_policy_changed");
    for (const snapshot of snapshots) {
      const prior = before.snapshots?.find(item => item.root === snapshot.root);
      if (!prior) continue;
      if (prior.head !== snapshot.head) {
        if (prior.head === null || snapshot.head === null) reasons.push("history_base_unavailable");
        else if (!await descendsFrom(snapshot.root, prior.head, snapshot.head)) reasons.push("git_history_rewritten");
      }
      const available = new Set(snapshot.files.map(file => file.path));
      if (prior.files.some(file => snapshot.unavailable.includes(file.path)) ||
          prior.unavailable.some(name => available.has(name))) reasons.push("evidence_availability_changed");
    }
    const delta = changes(before.snapshots, snapshots);
    const state = reasons.length ? "invalidated" : before.snapshots === null ? "baseline" : delta.length ? "changed" : "unchanged";
    const recommendationId = before.host_assessment?.id ?? before.assessment?.id;
    const outcome = [...before.outcomes].reverse().find(item => item.recommendation_id === recommendationId) ?? null;
    const priorRecommendation = before.host_assessment ? {
      code: "host_selected_followup", diagnosis: before.host_assessment.report.diagnosis,
      action: before.host_assessment.report.next_action, acceptance_check: before.host_assessment.report.acceptance_check,
      evidence_refs: [], outcome: "unmeasured" as const,
    } : before.assessment?.report.recommendation;
    const prior = priorRecommendation ? { recommendation: priorRecommendation, outcome } : undefined;
    const context: JourneyUseResult["previous_context"] = before.assessment ? {
      assessment_id: recommendationId!, recommendation: priorRecommendation!.action.slice(0, 1200), outcome,
      host_assessment: before.host_assessment ? {
        ...before.host_assessment, report: {
          summary: before.host_assessment.report.summary.slice(0, 1200),
          diagnosis: before.host_assessment.report.diagnosis.slice(0, 800),
          next_action: before.host_assessment.report.next_action.slice(0, 800),
          acceptance_check: before.host_assessment.report.acceptance_check.slice(0, 800),
          limitations: before.host_assessment.report.limitations.slice(0, 2).map(value => value.slice(0, 400)),
        },
      } : null,
      comparability: state === "invalidated" ? "invalidated" : "not_established",
    } : null;
    let stored = current;
    // A completely unchanged scan returns the existing checkpoint and assessment, earning no progress.
    if (state !== "unchanged" || canonicalize(before.snapshots) !== canonicalize(snapshots)) {
      const next = nextCheckpoint(current);
      next.event = state === "changed" ? "delta" : state;
      next.snapshots = snapshots;
      next.scope.framework_version = METHODOLOGY_VERSION;
      next.scope.collection_policy = COLLECTION_POLICY;
      next.invalidation_reasons = [...new Set(reasons)];
      if (state === "invalidated") {
        next.host_assessment = null; next.outcomes = [];
        if (before.snapshots !== null) next.scope.revision++;
      }
      if (state !== "unchanged") next.assessment = {
        id: randomUUID(), host: input.host, created_at: next.created_at,
        report: diagnoseDelta({
          task: next.scope.task, mode: state === "changed" ? "delta" : state,
          artifacts: state === "invalidated" ? changes(null, snapshots) : delta,
          ...(prior && state !== "invalidated" ? { prior } : {}),
        }),
      };
      stored = await commitCheckpoint(path, next, current);
    }
    let remaining = byteBudget;
    const allChanges = state === "invalidated" ? changes(null, snapshots) : delta;
    const selectedChanges = allChanges.filter(item => !input.excerptPaths || input.excerptPaths.includes(item.path)).slice(0, fileBudget);
    const visible = selectedChanges.map(({ before, after, ...item }, index) => {
      const allocation = Math.floor(remaining / (selectedChanges.length - index));
      const rendered = renderDeltaExcerpt(before, after, allocation);
      const unavailable = "Previously selected evidence is unavailable; no content judgment.".slice(0, allocation);
      const excerpt = item.status === "unavailable" ? unavailable : rendered.text;
      remaining -= Buffer.byteLength(excerpt);
      return { ...item, excerpt, excerpt_truncated: rendered.truncated,
        excerpt_format: item.status === "unavailable" ? "unavailable" as const : rendered.format,
        omitted_hunks: rendered.omitted_hunks };
    });
    return {
      state, scope_id: stored.checkpoint.scope.scope_id, revision: stored.checkpoint.scope.revision,
      checkpoint_id: stored.checkpoint.checkpoint_id, assessment_created: state !== "unchanged",
      assessment: stored.checkpoint.assessment, previous_context: context, changes: visible, omitted_changes: allChanges.length - visible.length,
      recommendation_sources: (stored.checkpoint.assessment?.report.recommendation.evidence_refs ?? []).map(id => {
        const source = state === "unchanged" ? undefined : allChanges.find(item => item.id === id);
        const shown = source ? visible.find(item => item.id === id) : undefined;
        const exposure = !shown ? "omitted_by_selection" : shown.excerpt_format === "unavailable" ? "unavailable"
          : !shown.excerpt || (shown.omitted_hunks > 0 && !shown.excerpt.startsWith("@@")) ? "omitted_by_budget"
          : shown.excerpt_format === "bounded_samples_not_diff" ? "samples_only"
          : shown.excerpt_truncated ? "partial_hunks" : "complete_hunks";
        return { id, path: source?.path ?? null, repository: source?.repository ?? null,
          excerpt_selected: ["partial_hunks", "complete_hunks", "samples_only"].includes(exposure), exposure };
      }),
      excluded: snapshots.map(snapshot => snapshot.excluded), invalidation_reasons: [...new Set(reasons)], private_only: true,
    };
  });
}
export async function recordOutcome(input: {
  stateDirectory: string; expectedCheckpoint: string; recommendationId: string;
  status: RecommendationOutcomeStatus; note: string;
  reflectionCompleted?: boolean; check?: FollowupCheck;
  contentOrigin?: "work_derived" | "synthetic" | "unknown";
  checkEvidenceFile?: string;
}) {
  if (!["not_tried", "declined", "helped", "did_not_help", "inconclusive"].includes(input.status) ||
      typeof input.note !== "string" || input.note.length > 2000) fail("invalid_user_outcome");
  const path = selectedPath(input.stateDirectory);
  const check = input.check === undefined ? null : validateFollowupCheck(input.check);
  let selectedCheckDigest: string | null = null;
  if (input.checkEvidenceFile !== undefined) {
    if (!check) fail("check_required_for_selected_evidence");
    const selected = selectedPath(input.checkEvidenceFile);
    if (selected === path || selected.startsWith(path + "/") || excludedPath(basename(selected))) fail("ineligible_check_evidence");
    const content = await readBounded(selected, LIMITS.fileBytes);
    if (!content.trim()) fail("empty_check_evidence");
    selectedCheckDigest = hash(content);
  }
  if (input.reflectionCompleted !== undefined && typeof input.reflectionCompleted !== "boolean") fail("invalid_user_outcome");
  if (check !== null && ["not_tried", "declined"].includes(input.status)) fail("contradictory_user_outcome");
  const origin = input.contentOrigin ?? check?.content_origin ?? "unknown";
  if (!["work_derived", "synthetic", "unknown"].includes(origin) ||
      (check !== null && check.content_origin !== origin) ||
      (input.reflectionCompleted && origin === "unknown")) fail("explicit_consistent_origin_required");
  return withLock(path, async () => {
    const records = await readHistory(path);
    const current = records[0]!;
    expected(current, input.expectedCheckpoint);
    if (!current.checkpoint.assessment || !current.checkpoint.snapshots) fail("baseline_required_before_outcome");
    const epoch = records.filter(record => record.checkpoint.scope.revision === current.checkpoint.scope.revision);
    const recommendation = epoch.map(record => activeRecommendation(record.checkpoint)).find(item => item?.id === input.recommendationId);
    if (!recommendation) fail("recommendation_not_in_current_scope_history");
    const evidenceDigest = selectedCheckDigest ?? snapshotEvidence(current.checkpoint.snapshots);
    const evidenceKind = selectedCheckDigest ? "selected_check" as const : "repository_snapshot" as const;
    const seenSequences = epoch.flatMap(record => {
      const observations = record.checkpoint.outcomes.filter(outcome => outcome.context?.evidence_kind === evidenceKind &&
        outcome.context.evidence_digest === evidenceDigest).map(outcome => outcome.context!.first_observed_sequence);
      if (evidenceKind === "repository_snapshot" && record.checkpoint.snapshots &&
          snapshotEvidence(record.checkpoint.snapshots) === evidenceDigest) observations.push(record.checkpoint.sequence);
      return observations;
    });
    const firstObserved = seenSequences.length ? Math.min(...seenSequences) : current.checkpoint.sequence + 1;
    const stableOutcome = (outcome: typeof current.checkpoint.outcomes[number]) => canonicalize({
      key: outcome.context?.recommendation_key, evidence: outcome.context?.evidence_digest,
      kind: outcome.context?.evidence_kind, check: outcome.check, origin: outcome.content_origin,
    });
    const newIdentity = canonicalize({ key: recommendation.key, evidence: evidenceDigest, kind: evidenceKind, check, origin });
    const duplicate = current.checkpoint.outcomes.findIndex(outcome => !!outcome.context && stableOutcome(outcome) === newIdentity);
    const previous = current.checkpoint.outcomes[duplicate];
    const reflectionCompleted = input.reflectionCompleted ?? previous?.reflection_completed ?? false;
    if (previous && previous.status === input.status && previous.note === input.note &&
        previous.reflection_completed === reflectionCompleted) return {
      ...summary(current), state: "outcome_already_recorded", progress_credit: false,
      association: activeRecommendation(current.checkpoint)?.key === recommendation.key ? "current" : "historical",
    };
    const next = nextCheckpoint(current);
    next.event = "outcome";
    const outcome = {
      recommendation_id: input.recommendationId, status: input.status, note: input.note,
      recorded_at: previous?.recorded_at ?? next.created_at, provenance: "explicit_user_report" as const,
      sequence: previous?.sequence ?? next.sequence, reflection_completed: reflectionCompleted, check,
      content_origin: origin,
      context: {
        recommendation_key: recommendation.key, observed_assessment_id: current.checkpoint.assessment.id,
        evidence_digest: evidenceDigest, evidence_kind: evidenceKind, first_observed_sequence: firstObserved,
        reflection_sequence: reflectionCompleted ? previous?.context?.reflection_sequence ?? next.sequence : null,
      },
    };
    if (duplicate < 0) next.outcomes.push(outcome); else next.outcomes[duplicate] = outcome;
    return { ...summary(await commitCheckpoint(path, next, current)), state: previous ? "outcome_revised" : "outcome_recorded",
      association: activeRecommendation(current.checkpoint)?.key === recommendation.key ? "current" : "historical",
      progress_credit: false };
  });
}
export async function recordAssessment(input: {
  stateDirectory: string; expectedCheckpoint: string; host: Host; report: HostAssessmentInput;
}) {
  const path = selectedPath(input.stateDirectory);
  const report = validateHostAssessment(input.report);
  if (!["codex", "claude_code"].includes(input.host)) fail("unsupported_host");
  return withLock(path, async () => {
    const current = (await readHistory(path))[0]!;
    expected(current, input.expectedCheckpoint);
    if (!current.checkpoint.assessment || !current.checkpoint.snapshots) fail("baseline_required_before_host_assessment");
    const next = nextCheckpoint(current);
    next.event = "host_assessment";
    const revising = current.checkpoint.host_assessment?.local_assessment_id === current.checkpoint.assessment.id;
    const sameAdvice = revising && sameRecommendation(current.checkpoint.host_assessment!.report, report);
    next.host_assessment = {
      id: sameAdvice ? current.checkpoint.host_assessment!.id : randomUUID(), host: input.host, recorded_at: next.created_at,
      assessed_checkpoint_id: current.checkpoint.checkpoint_id,
      local_assessment_id: current.checkpoint.assessment.id,
      method: "host_semantic_reasoning", human_attribution: "not_independently_verified", report,
      revision: revising ? current.checkpoint.host_assessment!.revision + 1 : 1,
    };
    return {
      ...summary(await commitCheckpoint(path, next, current)),
      state: revising ? "host_report_revised" : "host_report_recorded",
      recommendation_changed: revising && !sameAdvice,
      assessment_created: false, progress_credit: false,
    };
  });
}
export async function resetJourney(input: { stateDirectory: string; scopeId: string; expectedCheckpoint: string }) {
  const path = selectedPath(input.stateDirectory);
  return withLock(path, async () => {
    const current = (await readHistory(path))[0]!;
    expected(current, input.expectedCheckpoint);
    if (current.checkpoint.scope.scope_id !== input.scopeId) fail("scope_confirmation_mismatch");
    await validateRecordDirectory(path);
    const next: JourneyCheckpoint = {
      ...structuredClone(current.checkpoint), checkpoint_id: randomUUID(), sequence: 1, previous_digest: null,
      previous_checkpoint: null, created_at: new Date().toISOString(), event: "reset",
      scope: { ...current.checkpoint.scope, revision: current.checkpoint.scope.revision + 1 },
      snapshots: null, assessment: null, host_assessment: null, outcomes: [], invalidation_reasons: ["explicit_reset"],
    };
    const stored = await commitCheckpoint(path, next, current);
    await removeOldRecords(path, next.checkpoint_id);
    return summary(stored);
  });
}
export async function forgetJourney(input: { stateDirectory: string; scopeId: string }) {
  return forgetStorage(selectedPath(input.stateDirectory), input.scopeId);
}
export async function recoverJourneyLock(input: { stateDirectory: string; lockToken: string }) {
  return recoverLock(selectedPath(input.stateDirectory), input.lockToken);
}
export async function selectedStatePath(path: string): Promise<string> {
  return (await directory(path, true)).path;
}
