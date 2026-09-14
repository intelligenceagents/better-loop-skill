import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, rename, rmdir, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { canonicalize } from "@better-loop/contracts";
import { INDICATORS, TASK_FAMILIES } from "@better-loop/core";
import type { TaskContext } from "@better-loop/core";
import { directory, digest, exact, fail, hash, hex, noLinks, readJson, selectedPath, syncDirectory, text, timestamp, uuid } from "./safety.js";
import { COLLECTION_POLICY, JOURNEY_SCHEMA, LIMITS } from "./types.js";
import type { HostAssessmentInput, JourneyCheckpoint, JourneyScope, StoredJourney } from "./types.js";
import type { FollowupCheck } from "./diagnosis.js";

interface Identity { schema_version: typeof JOURNEY_SCHEMA; scope_id: string }
interface Pointer { checkpoint_id: string; sequence: number; digest: string }
export interface Lock { token: string; pid: number; created_at: string }
const RECORD_PATTERN = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\.json$/;

export function validateTask(input: unknown): TaskContext {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid_task_context");
  const task = input as Record<string, unknown>;
  const keys = Object.keys(task);
  if (keys.some(key => !["family", "goal", "acceptance_criteria", "not_applicable"].includes(key)) ||
      !TASK_FAMILIES.includes(task.family as never) || typeof task.goal !== "string" || !task.goal.trim() ||
      task.goal.length > 4000 || !Array.isArray(task.acceptance_criteria) || task.acceptance_criteria.length > 16 ||
      task.acceptance_criteria.some(item => typeof item !== "string" || !item.trim() || item.length > 2000)) fail("invalid_task_context");
  if (task.not_applicable !== undefined) {
    if (!task.not_applicable || typeof task.not_applicable !== "object" || Array.isArray(task.not_applicable) ||
        Object.entries(task.not_applicable).some(([key, value]) => !Object.hasOwn(INDICATORS, key) ||
          typeof value !== "string" || !value.trim() || value.length > 1000)) fail("invalid_task_context");
  }
  return structuredClone(input) as TaskContext;
}
function validateScope(input: unknown): asserts input is JourneyScope {
  exact(input, ["scope_id", "revision", "roots", "task", "framework_version", "collection_policy"]);
  uuid(input.scope_id);
  if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 1) fail("corrupt_state");
  text(input.framework_version, 100);
  if (!input.framework_version || typeof input.collection_policy !== "string") fail("corrupt_state");
  validateTask(input.task);
  if (!Array.isArray(input.roots) || !input.roots.length || input.roots.length > LIMITS.repositories) fail("corrupt_state");
  const names = new Set();
  for (const root of input.roots) {
    exact(root, ["path", "identity"]); text(root.path); text(root.identity, 100);
    if (!isAbsolute(root.path) || names.has(root.path) || !/^\d+:\d+$/.test(root.identity)) fail("corrupt_state");
    names.add(root.path);
  }
}
export function validateHostAssessment(input: unknown): HostAssessmentInput {
  exact(input, ["summary", "diagnosis", "next_action", "acceptance_check", "limitations"]);
  for (const key of ["summary", "diagnosis", "next_action", "acceptance_check"]) {
    text(input[key], 2000);
    if (!(input[key] as string).trim()) fail("invalid_host_assessment");
  }
  if (!Array.isArray(input.limitations) || input.limitations.length > 8) fail("invalid_host_assessment");
  input.limitations.forEach(value => text(value, 1000));
  return structuredClone(input) as unknown as HostAssessmentInput;
}
export function validateFollowupCheck(input: unknown): FollowupCheck {
  exact(input, ["content_origin", "change", "comparison", "outcome", "quality_floor", "critical_regression", "check_result"]);
  const choices: Record<string, string[]> = {
    content_origin: ["work_derived", "synthetic"], change: ["followup", "revision_only", "copy", "unknown"],
    comparison: ["comparable", "not_comparable", "unknown"],
    outcome: ["improved", "no_change", "regressed", "mixed", "not_measured", "insufficient_evidence"],
    quality_floor: ["met", "not_met", "unknown"], critical_regression: ["none_observed", "observed", "unknown"],
    check_result: ["met", "not_met", "unknown"],
  };
  if (Object.entries(choices).some(([key, allowed]) => !allowed.includes(input[key] as string))) fail("invalid_followup_check");
  if (input.outcome === "improved" && (input.comparison !== "comparable" || input.quality_floor !== "met" ||
      input.critical_regression !== "none_observed" || input.check_result !== "met")) fail("unsupported_reported_improvement");
  return structuredClone(input) as unknown as FollowupCheck;
}
function validateCheckpoint(input: unknown): asserts input is JourneyCheckpoint {
  exact(input, ["schema_version", "checkpoint_id", "sequence", "previous_digest", "previous_checkpoint", "created_at", "event",
    "scope", "snapshots", "assessment", "host_assessment", "outcomes", "invalidation_reasons"]);
  if (input.schema_version !== JOURNEY_SCHEMA) fail("unsupported_state_version");
  uuid(input.checkpoint_id); timestamp(input.created_at); validateScope(input.scope);
  if (!Number.isSafeInteger(input.sequence) || (input.sequence as number) < 1 || (input.sequence as number) > LIMITS.checkpoints) fail("corrupt_state");
  if (input.previous_digest !== null) hex(input.previous_digest);
  if (input.previous_checkpoint !== null) uuid(input.previous_checkpoint);
  if ((input.sequence === 1) !== (input.previous_digest === null && input.previous_checkpoint === null) ||
      (input.previous_digest === null) !== (input.previous_checkpoint === null)) fail("corrupt_state");
  if (!["created", "baseline", "delta", "unchanged", "invalidated", "scope_updated", "outcome", "host_assessment", "reset"].includes(input.event as string)) fail("corrupt_state");
  if (!Array.isArray(input.invalidation_reasons) || input.invalidation_reasons.length > 32) fail("corrupt_state");
  input.invalidation_reasons.forEach(value => text(value, 100));
  if (!Array.isArray(input.outcomes) || input.outcomes.length > LIMITS.checkpoints) fail("corrupt_state");
  for (const outcome of input.outcomes) {
    exact(outcome, ["recommendation_id", "status", "note", "recorded_at", "provenance", "sequence", "reflection_completed", "content_origin", "check",
      ...(Object.hasOwn(outcome, "context") ? ["context"] : [])]);
    uuid(outcome.recommendation_id); timestamp(outcome.recorded_at); text(outcome.note, 2000);
    if (!["not_tried", "declined", "helped", "did_not_help", "inconclusive"].includes(outcome.status as string) ||
        outcome.provenance !== "explicit_user_report" || typeof outcome.reflection_completed !== "boolean" ||
        !Number.isSafeInteger(outcome.sequence) || (outcome.sequence as number) < 1 ||
        (outcome.sequence as number) > (input.sequence as number) ||
        !["work_derived", "synthetic", "unknown"].includes(outcome.content_origin as string)) fail("corrupt_state");
    if (outcome.check !== null) validateFollowupCheck(outcome.check);
    if (outcome.context !== undefined) {
      exact(outcome.context, ["recommendation_key", "observed_assessment_id", "evidence_digest", "evidence_kind", "first_observed_sequence", "reflection_sequence"]);
      const context = outcome.context;
      hex(context.recommendation_key); hex(context.evidence_digest); uuid(context.observed_assessment_id);
      if (!["repository_snapshot", "selected_check"].includes(context.evidence_kind as string) ||
          !Number.isSafeInteger(context.first_observed_sequence) || (context.first_observed_sequence as number) < 1 ||
          (context.first_observed_sequence as number) > (input.sequence as number) ||
          (context.reflection_sequence !== null && (!Number.isSafeInteger(context.reflection_sequence) ||
            (context.reflection_sequence as number) < 1 || (context.reflection_sequence as number) > (input.sequence as number)))) fail("corrupt_state");
    }
  }
  if (input.host_assessment !== null) {
    exact(input.host_assessment, ["id", "host", "recorded_at", "assessed_checkpoint_id", "local_assessment_id", "method", "human_attribution", "report", "revision"]);
    const host = input.host_assessment;
    uuid(host.id); uuid(host.assessed_checkpoint_id); uuid(host.local_assessment_id); timestamp(host.recorded_at);
    if (!["claude_code", "codex"].includes(host.host as string) || host.method !== "host_semantic_reasoning" ||
        host.human_attribution !== "not_independently_verified" || !Number.isSafeInteger(host.revision) || (host.revision as number) < 1) fail("corrupt_state");
    validateHostAssessment(host.report);
  }
  if (input.assessment !== null) {
    exact(input.assessment, ["id", "host", "created_at", "report"]);
    uuid(input.assessment.id); timestamp(input.assessment.created_at);
    if (!["claude_code", "codex"].includes(input.assessment.host as string)) fail("corrupt_state");
    const report = input.assessment.report;
    exact(report, ["schema_version", "framework_version", "classification", "method", "mode", "recommendation", "prior_context",
      "human_observations", "metrics", "measured_improvement", "limitations"]);
    if (report.schema_version !== "bl-delta-report-0.1" || report.classification !== "private_local_journey_not_export" ||
        report.method !== "deterministic_artifact_diagnosis" || !["baseline", "delta", "invalidated"].includes(report.mode as string) ||
        report.measured_improvement !== null) fail("corrupt_state");
    exact(report.recommendation, ["code", "diagnosis", "action", "acceptance_check", "evidence_refs", "outcome"]);
    for (const key of ["code", "diagnosis", "action", "acceptance_check"]) text(report.recommendation[key], 8000);
    if (report.recommendation.outcome !== "unmeasured" || !Array.isArray(report.recommendation.evidence_refs) ||
        report.recommendation.evidence_refs.some(value => typeof value !== "string")) fail("corrupt_state");
    exact(report.metrics, ["total_model_tokens", "model_time_ms", "human_effort_minutes", "cash_cost", "estimated_api_cost", "quality"]);
    if (Object.values(report.metrics).some(value => value !== null)) fail("corrupt_state");
    if (!Array.isArray(report.human_observations) || report.human_observations.length !== 11 ||
        report.human_observations.some(value => !value || value.state !== "insufficient_evidence" || value.actor !== "unknown" || value.rating !== null)) fail("corrupt_state");
  }
  if (input.snapshots !== null) {
    if (!Array.isArray(input.snapshots) || input.snapshots.length !== input.scope.roots.length) fail("corrupt_state");
    let total = 0;
    for (const [index, snapshot] of input.snapshots.entries()) {
      exact(snapshot, ["root", "identity", "head", "files", "unavailable", "excluded"]);
      if (snapshot.root !== input.scope.roots[index]!.path || snapshot.identity !== input.scope.roots[index]!.identity ||
          (snapshot.head !== null && (typeof snapshot.head !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(snapshot.head)))) fail("corrupt_state");
      if (!Array.isArray(snapshot.files) || snapshot.files.length > LIMITS.filesPerRepository ||
          !Array.isArray(snapshot.unavailable) || snapshot.unavailable.length > LIMITS.filesPerRepository) fail("corrupt_state");
      const paths = new Set<string>();
      for (const file of snapshot.files) {
        exact(file, ["path", "hash", "text"]); text(file.path); hex(file.hash);
        if (typeof file.text !== "string" || Buffer.byteLength(file.text) > LIMITS.fileBytes || file.hash !== hash(file.text) ||
            paths.has(file.path) || isAbsolute(file.path) || file.path.split("/").includes("..")) fail("corrupt_state");
        paths.add(file.path); total += Buffer.byteLength(file.text);
      }
      snapshot.unavailable.forEach(path => text(path));
      if (!snapshot.excluded || typeof snapshot.excluded !== "object" || Array.isArray(snapshot.excluded) ||
          Object.values(snapshot.excluded).some(value => !Number.isSafeInteger(value) || (value as number) < 0)) fail("corrupt_state");
    }
    if (total > LIMITS.totalTextBytes) fail("corrupt_state");
  }
}
async function identity(path: string): Promise<Identity> {
  await directory(path, true);
  const input = await readJson(join(path, "identity.json"), 2048);
  exact(input, ["schema_version", "scope_id"]); uuid(input.scope_id);
  if (input.schema_version !== JOURNEY_SCHEMA) fail("unsupported_state_version");
  return input as unknown as Identity;
}
async function immutable(path: string, value: unknown): Promise<void> {
  const body = canonicalize(value) + "\n";
  if (Buffer.byteLength(body) > LIMITS.checkpointBytes) fail("state_size_limit_exceeded");
  const file = await open(path, "wx", 0o600);
  try { await file.writeFile(body); await file.sync(); } finally { await file.close(); }
}
export async function readStored(path: string): Promise<StoredJourney> {
  try {
    const selected = await identity(path);
    await directory(join(path, "records"), true);
    const pointer = await readJson(join(path, "current.json"), 2048);
    exact(pointer, ["checkpoint_id", "sequence", "digest"]); uuid(pointer.checkpoint_id); hex(pointer.digest);
    const checkpoint = await readJson(join(path, "records", pointer.checkpoint_id + ".json"), LIMITS.checkpointBytes);
    validateCheckpoint(checkpoint);
    if (checkpoint.scope.scope_id !== selected.scope_id || checkpoint.checkpoint_id !== pointer.checkpoint_id ||
        checkpoint.sequence !== pointer.sequence || digest(checkpoint) !== pointer.digest) fail("corrupt_state");
    return { checkpoint, digest: pointer.digest };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") fail("incomplete_or_missing_state");
    throw error;
  }
}
export async function readHistory(path: string): Promise<StoredJourney[]> {
  const current = await readStored(path);
  const history = [current];
  let latest = current;
  while (latest.checkpoint.previous_checkpoint !== null) {
    if (history.length >= LIMITS.checkpoints) fail("corrupt_state");
    const previous = await readJson(join(path, "records", latest.checkpoint.previous_checkpoint + ".json"), LIMITS.checkpointBytes);
    validateCheckpoint(previous);
    if (digest(previous) !== latest.checkpoint.previous_digest ||
        previous.sequence !== latest.checkpoint.sequence - 1 || previous.scope.scope_id !== current.checkpoint.scope.scope_id) fail("corrupt_state");
    latest = { checkpoint: previous, digest: digest(previous) };
    history.push(latest);
  }
  return history;
}
export async function commitCheckpoint(path: string, checkpoint: JourneyCheckpoint, previous: StoredJourney | null): Promise<StoredJourney> {
  await directory(path, true); await directory(join(path, "records"), true);
  if (previous && (await readStored(path)).digest !== previous.digest) fail("stale_checkpoint");
  validateCheckpoint(checkpoint);
  const recordDigest = digest(checkpoint);
  await immutable(join(path, "records", checkpoint.checkpoint_id + ".json"), checkpoint);
  await syncDirectory(join(path, "records"));
  const pointer: Pointer = { checkpoint_id: checkpoint.checkpoint_id, sequence: checkpoint.sequence, digest: recordDigest };
  const pending = join(path, "pending-" + randomUUID() + ".json");
  await immutable(pending, pointer);
  // An incomplete new record is harmless until this atomic pointer replacement.
  await rename(pending, join(path, "current.json"));
  await syncDirectory(path);
  return { checkpoint, digest: recordDigest };
}
function parseLock(input: unknown): Lock {
  exact(input, ["token", "pid", "created_at"]); uuid(input.token); timestamp(input.created_at);
  if (!Number.isSafeInteger(input.pid) || (input.pid as number) < 1) fail("corrupt_lock");
  return input as unknown as Lock;
}
export async function withLock<T>(path: string, callback: () => Promise<T>): Promise<T> {
  await identity(path);
  const lock: Lock = { token: randomUUID(), pid: process.pid, created_at: new Date().toISOString() };
  const lockPath = join(path, "LOCK");
  try { await immutable(lockPath, lock); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") fail("journey_busy"); throw error; }
  try { return await callback(); }
  finally {
    try {
      const held = parseLock(await readJson(lockPath, 2048));
      if (held.token === lock.token) await unlink(lockPath);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}
export async function createStorage(path: string, scopeId: string): Promise<void> {
  selectedPath(path); uuid(scopeId);
  // Only the explicitly selected parent chain is created; no search for a state directory.
  const missing: string[] = [];
  let parent = dirname(path);
  while (true) {
    try { await noLinks(parent); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; missing.unshift(parent); parent = dirname(parent); }
  }
  for (const item of missing) await mkdir(item, { mode: 0o700 });
  await noLinks(dirname(path));
  try { await mkdir(path, { mode: 0o700 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") fail("state_directory_already_exists"); throw error; }
  await immutable(join(path, "identity.json"), { schema_version: JOURNEY_SCHEMA, scope_id: scopeId });
  await mkdir(join(path, "records"), { mode: 0o700 });
  await syncDirectory(path);
}
export async function recoverLock(path: string, token: string): Promise<{ state: "lock_recovered" }> {
  await identity(path); uuid(token);
  const lock = parseLock(await readJson(join(path, "LOCK"), 2048));
  if (lock.token !== token) fail("stale_lock_token");
  let dead = false;
  try { process.kill(lock.pid, 0); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") dead = true; }
  if (!dead) fail("lock_owner_may_be_alive");
  if (canonicalize(await readJson(join(path, "LOCK"), 2048)) !== canonicalize(lock)) fail("stale_lock_token");
  await unlink(join(path, "LOCK"));
  return { state: "lock_recovered" };
}
export async function inspectLock(path: string): Promise<Lock | null> {
  await identity(path);
  try { return parseLock(await readJson(join(path, "LOCK"), 2048)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function removeOldRecords(path: string, keep: string): Promise<void> {
  const names = await validateRecordDirectory(path);
  const records = join(path, "records");
  for (const name of names) {
    if (name !== keep + ".json") {
      await unlink(join(records, name));
    }
  }
}
export async function validateRecordDirectory(path: string): Promise<string[]> {
  const records = join(path, "records");
  await directory(records, true);
  const names = await readdir(records);
  for (const name of names) {
    if (!RECORD_PATTERN.test(name)) fail("unexpected_state_file");
    const stat = await lstat(join(records, name));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail("unexpected_state_file");
  }
  return names;
}
export async function forgetStorage(path: string, scopeId: string): Promise<{ state: "forgotten"; scope_id: string }> {
  if ((await identity(path)).scope_id !== scopeId) fail("scope_confirmation_mismatch");
  return withLock(path, async () => {
    const entries = await readdir(path);
    if (entries.some(name => !["identity.json", "current.json", "records", "LOCK"].includes(name) && !/^pending-[a-f0-9-]+\.json$/.test(name))) fail("unexpected_state_file");
    // Validate the exact dedicated directory before deleting any contents. No recursive parent deletion.
    // A crash during initial creation may leave identity but no records directory.
    const records = entries.includes("records") ? await validateRecordDirectory(path) : [];
    for (const name of entries.filter(name => name !== "records")) {
      const stat = await lstat(join(path, name));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail("unexpected_state_file");
    }
    for (const name of records) await unlink(join(path, "records", name));
    if (entries.includes("records")) await rmdir(join(path, "records"));
    for (const name of entries.filter(name => name !== "records" && name !== "LOCK" && name !== "identity.json")) await unlink(join(path, name));
    // Keep scope identity until the remaining local data has been removed.
    await unlink(join(path, "identity.json"));
    await unlink(join(path, "LOCK"));
    await rmdir(path);
    return { state: "forgotten", scope_id: scopeId };
  });
}
export function nextCheckpoint(previous: StoredJourney): JourneyCheckpoint {
  if (previous.checkpoint.sequence >= LIMITS.checkpoints) fail("history_limit_reset_required");
  return {
    ...structuredClone(previous.checkpoint), checkpoint_id: randomUUID(), sequence: previous.checkpoint.sequence + 1,
    previous_digest: previous.digest, previous_checkpoint: previous.checkpoint.checkpoint_id, created_at: new Date().toISOString(),
  };
}
export const currentCollectionPolicy = COLLECTION_POLICY;
