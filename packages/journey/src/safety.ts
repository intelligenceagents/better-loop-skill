import { createHash } from "node:crypto";
import { constants, lstatSync, readlinkSync } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, parse, resolve } from "node:path";
import { homedir } from "node:os";
import { canonicalize, parseJson } from "@better-loop/contracts";
import { JourneyError } from "./types.js";

export const hash = (text: string | Uint8Array): string => createHash("sha256").update(text).digest("hex");
export const digest = (value: unknown): string => hash(canonicalize(value));
export function fail(code: string): never { throw new JourneyError(code); }
export function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail("corrupt_state");
}
export function text(value: unknown, max = 4096): asserts value is string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) fail("corrupt_state");
}
export function uuid(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value)) fail("corrupt_state");
}
export function hex(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail("corrupt_state");
}
export function timestamp(value: unknown): asserts value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail("corrupt_state");
}
export function selectedPath(input: string): string {
  if (typeof input !== "string" || !input.trim() || /[\u0000-\u001f]/u.test(input)) fail("invalid_selected_path");
  let result = resolve(input);
  // macOS ships these two root aliases. Resolve only a verified exact OS alias,
  // never arbitrary user symlinks or links deeper in the selected path.
  if (process.platform === "darwin") for (const alias of ["/tmp", "/var"]) {
    if (result !== alias && !result.startsWith(alias + "/")) continue;
    const target = "/private" + alias;
    if (lstatSync(alias).isSymbolicLink() && resolve("/", readlinkSync(alias)) === target &&
        lstatSync("/private").isDirectory() && !lstatSync("/private").isSymbolicLink() &&
        lstatSync(target).isDirectory() && !lstatSync(target).isSymbolicLink()) {
      result = target + result.slice(alias.length);
    }
  }
  if (result === parse(result).root || result === homedir() ||
      /(?:^|[/\\])(?:\.ssh|\.gnupg|\.codex|\.claude|\.config)(?:[/\\]|$)/i.test(result)) fail("invalid_selected_path");
  return result;
}
/** Reject symbolic links throughout the normalized selected path chain. */
export async function noLinks(input: string): Promise<void> {
  if (!isAbsolute(input)) fail("invalid_selected_path");
  let path = input;
  while (true) {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) fail("symlink_not_allowed");
    const parent = dirname(path);
    if (parent === path) break;
    path = parent;
  }
}
export async function directory(input: string, privateMode = false): Promise<{ path: string; identity: string }> {
  const path = selectedPath(input);
  await noLinks(path);
  const stat = await lstat(path);
  if (!stat.isDirectory() || (privateMode && (stat.mode & 0o077) !== 0)) fail("invalid_selected_directory");
  if (await realpath(path) !== path) fail("symlink_not_allowed");
  return { path, identity: `${stat.dev}:${stat.ino}` };
}
export async function readBounded(path: string, max: number, privateMode = false): Promise<string> {
  await noLinks(path);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await file.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size > max ||
        (privateMode && (before.mode & 0o077) !== 0)) fail("ineligible_file");
    const bytes = Buffer.alloc(max + 1);
    let size = 0;
    while (size < bytes.length) {
      const part = await file.read(bytes, size, bytes.length - size, null);
      if (!part.bytesRead) break;
      size += part.bytesRead;
    }
    const after = await file.stat();
    if (size > max || before.size !== after.size || before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs || after.nlink !== 1 || size !== after.size) fail("source_changed_retry");
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)); }
    catch { return fail("binary_or_invalid_utf8"); }
  } finally { await file.close(); }
}
export async function readJson(path: string, max: number): Promise<unknown> {
  try { return parseJson(await readBounded(path, max, true)); }
  catch (error) {
    if (error instanceof JourneyError || (error as NodeJS.ErrnoException).code === "ENOENT") throw error;
    return fail("corrupt_state");
  }
}
export async function syncDirectory(path: string): Promise<void> {
  const file = await open(path, constants.O_RDONLY);
  try { await file.sync(); } finally { await file.close(); }
}
