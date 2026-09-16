import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { parseJson } from "@better-loop/contracts";

const API = "https://api.github.com/repos/intelligenceagents/better-loop-skill/releases";
const RELEASES = "https://github.com/intelligenceagents/better-loop-skill/releases";
const TIMEOUT_MS = 2000;
const MAX_BYTES = 65536;
const SUCCESS_TTL = 24 * 60 * 60 * 1000;
const FAILURE_TTL = 5 * 60 * 1000;
const CACHE_FILE = "release-observation.json";
const CACHE_VERSION = "bl-release-observation-0.1";
// No numeric conversion: SemVer identifiers may exceed Number.MAX_SAFE_INTEGER.
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
type Version = { core: string[]; prerelease: string[] };

function version(input: string): Version | null {
  if (input.length > 128) return null;
  const match = SEMVER.exec(input);
  return match ? { core: match.slice(1, 4) as string[], prerelease: match[4]?.split(".") ?? [] } : null;
}
function numeric(a: string, b: string): number {
  return a.length === b.length ? (a === b ? 0 : a < b ? -1 : 1) : a.length < b.length ? -1 : 1;
}
/** SemVer precedence only; equal versions do not verify installed bytes. */
export function compareReleaseVersions(local: string, remote: string): number | null {
  const a = version(local), b = version(remote);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i++) {
    const compared = numeric(a.core[i]!, b.core[i]!);
    if (compared) return compared;
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1;
  }
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const left = a.prerelease[i], right = b.prerelease[i];
    if (left === undefined || right === undefined) return left === undefined ? -1 : 1;
    if (left === right) continue;
    const ln = /^\d+$/.test(left), rn = /^\d+$/.test(right);
    return ln && rn ? numeric(left, right) : ln !== rn ? (ln ? -1 : 1) : left < right ? -1 : 1;
  }
  return 0;
}
function stableTag(input: unknown): input is string {
  if (typeof input !== "string" || !input.startsWith("v")) return false;
  const parsed = version(input.slice(1));
  return parsed !== null && parsed.prerelease.length === 0;
}
type Observation =
  | { state: "release_metadata"; tag: string; published_at: string }
  | { state: "no_published_release" | "unknown" };
type Cached = { format: typeof CACHE_VERSION; checked_at: number; observation: Observation };
type ReleaseState = "new_release_available" | "no_newer_version_observed" | "no_published_release" | "unknown" | "disabled";
const NOTICES: Record<ReleaseState, string> = {
  new_release_available: "A newer stable Better Loop version was observed in public GitHub release metadata. Review it before a separate manual update.",
  no_newer_version_observed: "The observed stable release version is not newer than this helper version. This does not establish installed source or currentness.",
  no_published_release: "The public GitHub release list was empty when checked. This source build is not a verified published release.",
  unknown: "Better Loop release availability is unknown. Private coaching can continue.",
  disabled: "Better Loop release checking is disabled for this invocation. Private coaching can continue.",
};
export type ReleaseCheckOptions = { cacheDirectory?: string; disabled?: boolean };
export type ReleaseCheckResult = {
  state: ReleaseState; local_version: string; local_build: "prerelease" | "stable_version" | "unknown";
  checked_at: number | null; observation_source: "network" | "cache" | "none";
  observed_release: { tag: string; published_at: string } | null;
  source_verified: false; currentness: "not_established"; notice: string; release_url: string;
};
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function publishedAt(input: unknown, now: number): input is string {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(input)) return false;
  const time = Date.parse(input);
  return Number.isFinite(time) && time >= 0 && time <= now && new Date(time).toISOString() === input.replace("Z", ".000Z");
}
function release(value: unknown, now: number): Observation {
  if (!object(value) || !Number.isSafeInteger(value.id) || Number(value.id) <= 0 ||
      value.draft !== false || value.prerelease !== false || !stableTag(value.tag_name) ||
      !publishedAt(value.published_at, now) || value.url !== `${API}/${value.id}` ||
      value.html_url !== `${RELEASES}/tag/${value.tag_name}`) throw new Error("unusable_release");
  // name, body, assets, author and target_commitish are never copied, followed or executed.
  // target_commitish may name a branch; it is not an immutable source receipt.
  return { state: "release_metadata", tag: value.tag_name, published_at: value.published_at };
}

async function retrieve(fetcher: typeof fetch, now: number): Promise<Observation> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true; controller.abort();
      void reader?.cancel().catch(() => undefined);
      reject(new Error("release_timeout"));
    }, TIMEOUT_MS);
  });
  let bytes = 0; // Aggregate budget across latest and its one possible fallback.
  async function get(url: string) {
    if (expired) throw new Error("release_timeout");
    const response = await fetcher(url, {
      method: "GET", redirect: "error", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Better-Loop-Release-Check" },
      signal: controller.signal,
    });
    if (expired || response.redirected || (response.url && response.url !== url)) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error("unusable_response");
    }
    if (response.status === 404 && url === `${API}/latest`) {
      void response.body?.cancel().catch(() => undefined);
      return { missing: true as const };
    }
    const length = response.headers.get("content-length");
    if (response.status !== 200 || !/^application\/(?:json|vnd\.github\+json)(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") ||
        (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES - bytes)) || !response.body) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error("unusable_response");
    }
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    try {
      while (!expired) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BYTES) throw new Error("release_too_large");
        chunks.push(chunk.value);
      }
      if (expired) throw new Error("release_timeout");
      return { missing: false as const, value: parseJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) };
    } finally {
      void reader.cancel().catch(() => undefined);
      reader = undefined;
    }
  }
  try {
    return await Promise.race([deadline, (async (): Promise<Observation> => {
      const latest = await get(`${API}/latest`);
      if (!latest.missing) return release(latest.value, now);
      // Never infer absence from a bare 404. We only need one item to disprove emptiness.
      const list = await get(`${API}?per_page=1`);
      if (!list.missing && Array.isArray(list.value) && list.value.length === 0) return { state: "no_published_release" };
      return { state: "unknown" };
    })()]);
  } catch { return { state: "unknown" }; }
  finally {
    if (timer) clearTimeout(timer);
    expired = true; controller.abort();
    void reader?.cancel().catch(() => undefined);
  }
}

async function cachePath(selected: string): Promise<string> {
  if (!isAbsolute(selected)) throw new Error("selected_absolute_cache_required");
  try { await mkdir(selected, { mode: 0o700 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const stat = await lstat(selected);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("invalid_cache_directory");
  return join(selected, CACHE_FILE);
}
function cached(value: unknown, now: number): Cached | null {
  if (!object(value) || !exactKeys(value, ["format", "checked_at", "observation"]) ||
      value.format !== CACHE_VERSION || !Number.isSafeInteger(value.checked_at) ||
      Number(value.checked_at) < 0 || Number(value.checked_at) > now || !object(value.observation)) return null;
  const obs = value.observation;
  if (obs.state === "release_metadata") {
    if (!exactKeys(obs, ["state", "tag", "published_at"]) || !stableTag(obs.tag) || !publishedAt(obs.published_at, Number(value.checked_at))) return null;
  } else if (!exactKeys(obs, ["state"]) || (obs.state !== "unknown" && obs.state !== "no_published_release")) return null;
  const ttl = obs.state === "unknown" ? FAILURE_TTL : SUCCESS_TTL;
  if (now - Number(value.checked_at) >= ttl) return null;
  return value as unknown as Cached;
}
async function readCache(path: string, now: number): Promise<Cached | null> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1024) return null;
    // Bounded even if a same-user process grows the file after stat.
    const bytes = Buffer.alloc(1025);
    const read = await file.read(bytes, 0, bytes.length, 0);
    if (read.bytesRead > 1024) return null;
    return cached(parseJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, read.bytesRead))), now);
  } finally { await file.close(); }
}
async function writeCache(path: string, value: Cached) {
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1) return;
    await file.chmod(0o600);
    await file.truncate(0);
    await file.writeFile(JSON.stringify(value) + "\n");
  } finally { await file.close(); }
}
/** No selectable endpoint, credential, evidence, history or source-path request fields. */
export async function checkRelease(
  localVersion: string,
  options: ReleaseCheckOptions = {},
  dependencies: { fetch?: typeof fetch; now?: () => number } = {},
): Promise<ReleaseCheckResult> {
  const now = (dependencies.now ?? Date.now)();
  let observation: Observation = { state: "unknown" };
  let checkedAt: number | null = null;
  let source: ReleaseCheckResult["observation_source"] = "none";
  let path: string | undefined;
  const parsed = version(localVersion);
  if (!options.disabled && Number.isSafeInteger(now) && now >= 0 && parsed) {
    if (options.cacheDirectory) {
      try {
        path = await cachePath(options.cacheDirectory);
        const hit = await readCache(path, now);
        if (hit) { observation = hit.observation; checkedAt = hit.checked_at; source = "cache"; }
      } catch { /* Invalid/unwritable caches never block coaching or leak paths. */ }
    }
    if (source !== "cache") {
      observation = await retrieve(dependencies.fetch ?? fetch, now);
      checkedAt = now; source = "network";
      if (path) {
        try { await writeCache(path, { format: CACHE_VERSION, checked_at: now, observation }); }
        catch { /* Cache is advisory; never change settings or expose filesystem errors. */ }
      }
    }
  }
  const state: ReleaseState = options.disabled ? "disabled"
    : observation.state === "release_metadata"
      ? compareReleaseVersions(localVersion, observation.tag.slice(1))! < 0 ? "new_release_available" : "no_newer_version_observed"
      : observation.state;
  return {
    state, local_version: parsed ? localVersion : "unknown", local_build: !parsed ? "unknown" : parsed.prerelease.length ? "prerelease" : "stable_version",
    checked_at: checkedAt, observation_source: source,
    observed_release: observation.state === "release_metadata" ? { tag: observation.tag, published_at: observation.published_at } : null,
    source_verified: false, currentness: "not_established", notice: NOTICES[state],
    release_url: observation.state === "release_metadata" ? `${RELEASES}/tag/${encodeURIComponent(observation.tag)}` : RELEASES,
  };
}
