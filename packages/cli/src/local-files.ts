import { constants } from "node:fs";
import { open, lstat, realpath, rename, link, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { createInstructionPlan, validateInstructionPlan } from "@better-loop/core";
import type { InstructionPlan } from "@better-loop/core";

export async function readSelectedFile(path: string, maxBytes = 2 * 1024 * 1024): Promise<string> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > maxBytes) throw new Error("selected_file_not_bounded_regular_file");
    const bytes = Buffer.alloc(maxBytes + 1);
    let count = 0;
    while (count <= maxBytes) {
      const read = await file.read(bytes, count, bytes.length - count, null);
      count += read.bytesRead;
      if (read.bytesRead === 0) break;
    }
    if (count > maxBytes) throw new Error("selected_file_too_large");
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, count));
  } finally { await file.close(); }
}

export async function writePrivateOutput(path: string, text: string): Promise<void> {
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(text, "utf8"); await file.sync(); } finally { await file.close(); }
}

export class LocalOutputError extends Error {
  constructor(readonly code: "output_unavailable" | "output_reservation_changed" | "output_write_failed" | "output_cleanup_failed") {
    super(code);
  }
}
export interface PrivateOutputReservation {
  write(text: string): Promise<void>;
  release(): Promise<void>;
}

/** Reserve the exact private destination before starting costly reviewer processes. */
export async function reservePrivateOutput(path: string): Promise<PrivateOutputReservation> {
  let file;
  try {
    file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  } catch { throw new LocalOutputError("output_unavailable"); }
  const initial = await file.stat();
  let completed = false, released = false, writing = false, changed = false;
  const sameFile = (stat: typeof initial) => stat.isFile() && stat.nlink === 1 &&
    stat.dev === initial.dev && stat.ino === initial.ino;
  const untouched = (stat: typeof initial) => sameFile(stat) && stat.size === 0 &&
    stat.mtimeMs === initial.mtimeMs && stat.ctimeMs === initial.ctimeMs;
  return {
    async write(text) {
      if (released || completed || writing) throw new LocalOutputError("output_reservation_changed");
      try {
        if (!untouched(await lstat(path))) throw new Error("changed");
      } catch {
        changed = true;
        throw new LocalOutputError("output_reservation_changed");
      }
      writing = true;
      try {
        await file.writeFile(text, "utf8");
        await file.sync();
        if (!sameFile(await lstat(path))) {
          changed = true;
          throw new LocalOutputError("output_reservation_changed");
        }
        completed = true;
      } catch (error) {
        if (error instanceof LocalOutputError) throw error;
        throw new LocalOutputError("output_write_failed");
      }
    },
    async release() {
      if (released) return;
      released = true;
      try {
        if (!completed && !changed) {
          let current;
          try { current = await lstat(path); }
          catch (error) {
            if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
          }
          // Never remove a replacement or an externally edited unused reservation.
          if (current && (writing ? sameFile(current) : untouched(current))) await unlink(path);
        }
      } catch { throw new LocalOutputError("output_cleanup_failed"); }
      finally { await file.close(); }
    },
  };
}

function within(root: string, target: string) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function instructionTarget(selectedRoot: string, relativePath: string) {
  // A resolved selected project root is a scope, not permission to modify host-global instruction directories.
  const rootInput = resolve(selectedRoot);
  const inputStat = await lstat(rootInput);
  if (!inputStat.isDirectory() || inputStat.isSymbolicLink()) throw new Error("invalid_instruction_root");
  const root = await realpath(rootInput);
  const home = await realpath(homedir());
  const folded = root.toLowerCase();
  if (root === dirname(root) || within(root, home) ||
      [".agents", ".claude", ".codex", ".config"].some(name => within(join(home, name).toLowerCase(), folded))) {
    throw new Error("global_instruction_scope_forbidden");
  }
  const target = resolve(root, relativePath);
  if (!within(root, target)) throw new Error("instruction_scope_escape");
  let current = root;
  const identities: { path: string; dev: number; ino: number }[] = [];
  for (const part of ["", ...relative(root, dirname(target)).split(sep).filter(Boolean)]) {
    if (part) current = join(current, part);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !within(root, await realpath(current))) throw new Error("instruction_parent_not_contained");
    identities.push({ path: current, dev: stat.dev, ino: stat.ino });
  }
  const checkParents = async () => {
    for (const item of identities) {
      const now = await lstat(item.path);
      if (!now.isDirectory() || now.isSymbolicLink() || now.dev !== item.dev || now.ino !== item.ino) throw new Error("instruction_scope_changed");
    }
    if (await realpath(rootInput) !== root) throw new Error("instruction_scope_changed");
  };
  return { target, checkParents };
}

async function currentInstruction(path: string): Promise<{ text: string | null; mode: number; dev: number | null; ino: number | null }> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("instruction_not_regular_single_link_file");
    const text = await readSelectedFile(path, 262144);
    const after = await lstat(path);
    if (after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error("instruction_changed_during_read");
    return { text, mode: stat.mode & 0o777, dev: stat.dev, ino: stat.ino };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return { text: null, mode: 0o600, dev: null, ino: null };
    throw error;
  }
}

export async function planInstructionChange(root: string, relativePath: string, after: string): Promise<InstructionPlan> {
  // Validate the allowlist before touching the supplied relative path.
  createInstructionPlan(relativePath, null, after);
  const scope = await instructionTarget(root, relativePath);
  const current = await currentInstruction(scope.target);
  await scope.checkParents();
  return createInstructionPlan(relativePath, current.text, after);
}

export async function applyInstructionChange(
  root: string, input: unknown, approvedDigest: string, direction: "apply" | "rollback" = "apply",
): Promise<{ state: "applied" | "rolled_back"; relative_path: string; approval_digest: string }> {
  const plan = validateInstructionPlan(input);
  if (approvedDigest !== plan.approval_digest) throw new Error("exact_instruction_approval_required");
  const scope = await instructionTarget(root, plan.relative_path);
  const parent = dirname(scope.target);
  const lockPath = join(parent, `.better-loop-${plan.relative_path.split("/").at(-1)}.lock`);
  const lock = await open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  let temp: string | undefined;
  try {
    const expected = direction === "apply" ? plan.before : plan.after;
    const replacement = direction === "apply" ? plan.after : plan.before;
    const current = await currentInstruction(scope.target);
    if (current.text !== expected) throw new Error("instruction_bytes_precondition_failed");
    await scope.checkParents();
    if (replacement !== null) {
      temp = join(parent, `.better-loop-${randomUUID()}.tmp`);
      const file = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, current.mode);
      try { await file.writeFile(replacement, "utf8"); await file.sync(); } finally { await file.close(); }
    }
    const rechecked = await currentInstruction(scope.target);
    if (rechecked.text !== expected || rechecked.dev !== current.dev || rechecked.ino !== current.ino) throw new Error("instruction_bytes_precondition_failed");
    await scope.checkParents();
    if (replacement === null) await unlink(scope.target);
    else if (current.text === null) {
      // link is create-if-absent; never overwrite a concurrently created instruction file.
      await link(temp!, scope.target);
      await unlink(temp!);
      temp = undefined;
    } else {
      await rename(temp!, scope.target);
      temp = undefined;
    }
    return { state: direction === "apply" ? "applied" : "rolled_back", relative_path: plan.relative_path, approval_digest: plan.approval_digest };
  } finally {
    if (temp) await unlink(temp).catch(() => undefined);
    await lock.close();
    await unlink(lockPath);
  }
}
