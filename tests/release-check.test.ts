import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { link, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkRelease, compareReleaseVersions } from "../packages/cli/src/release-check.js";

const API = "https://api.github.com/repos/intelligenceagents/better-loop-skill/releases";
const PAGE = "https://github.com/intelligenceagents/better-loop-skill/releases";
const NOW = Date.parse("2026-09-15T12:00:00Z");
const record = (tag = "v1.2.3") => ({ id: 123, draft: false, prerelease: false, tag_name: tag,
  published_at: "2026-09-14T00:00:00Z", url: `${API}/123`, html_url: `${PAGE}/tag/${tag}` });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const run = (fetcher: typeof fetch, local = "1.2.3-rc.1") => checkRelease(local, {}, { fetch: fetcher, now: () => NOW });
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("fixed public requests omit local version, private cache path, credentials and remote prose", async t => {
  const root = await mkdtemp(join(tmpdir(), "release-private-sentinel-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const requests: unknown[] = [];
  const result = await checkRelease("1.2.3-PRIVATE-SENTINEL", { cacheDirectory: root }, {
    now: () => NOW, fetch: async (url, init) => {
      requests.push({ url, init });
      assert.equal(url, `${API}/latest`);
      assert.deepEqual(Object.keys(init!).sort(), ["cache", "credentials", "headers", "method", "redirect", "referrerPolicy", "signal"]);
      assert.equal(init!.method, "GET"); assert.equal(init!.redirect, "error");
      assert.equal(init!.credentials, "omit"); assert.equal(init!.cache, "no-store");
      assert.equal(init!.referrerPolicy, "no-referrer");
      assert.deepEqual(init!.headers, { Accept: "application/vnd.github+json", "User-Agent": "Better-Loop-Release-Check" });
      assert.ok(init!.signal instanceof AbortSignal);
      return json({ ...record(), name: "REMOTE_SENTINEL", body: "REMOTE_SENTINEL", assets: [{ url: "https://invalid.example" }] });
    },
  });
  assert.equal(result.state, "new_release_available");
  assert.equal(result.source_verified, false); assert.equal(result.currentness, "not_established");
  assert.doesNotMatch(JSON.stringify(requests), /PRIVATE.SENTINEL|release-private-sentinel/);
  assert.doesNotMatch(JSON.stringify(result), /REMOTE_SENTINEL|release-private-sentinel/);
  assert.equal(result.release_url, `${PAGE}/tag/v1.2.3`);
});

test("404 requires the exact one-item fallback; only a successful empty list establishes absence", async () => {
  for (const [fallback, expected] of [[json([], 200), "no_published_release"], [json([], 404), "unknown"], [json([record()]), "unknown"], [json({}), "unknown"]] as const) {
    const calls: string[] = [];
    const result = await run(async url => { calls.push(String(url)); return calls.length === 1 ? json({}, 404) : fallback; });
    assert.equal(result.state, expected);
    assert.deepEqual(calls, [`${API}/latest`, `${API}?per_page=1`]);
  }
  let calls = 0;
  assert.equal((await run(async () => { if (++calls === 1) return json({}, 404); throw Error("PRIVATE_SENTINEL"); })).state, "unknown");
});

test("invalid release metadata never becomes an update notice", async () => {
  const patches: Record<string, unknown>[] = [
    { draft: true }, { prerelease: true }, { draft: "false" }, { id: "123" }, { id: 0 },
    { url: `${API}/124` }, { html_url: "https://invalid.example/release" },
    { published_at: "2026-02-30T00:00:00Z" }, { published_at: "2027-01-01T00:00:00Z" },
    { published_at: 1 }, { tag_name: "1.2.3" }, { tag_name: "v1.2.3-rc.1" }, { tag_name: "v01.2.3" },
  ];
  for (const patch of patches) {
    const result = await run(async () => json({ ...record(), ...patch }));
    assert.equal(result.state, "unknown", JSON.stringify(patch)); assert.equal(result.observed_release, null);
  }
});

test("strict bounded UTF8 stream parsing rejects duplicate keys, bad encoding, oversize and transport failures", async () => {
  const bodies = [JSON.stringify(record()).replace('"id":123', '"id":123,"id":123'), new Uint8Array([0xff]), " ".repeat(65537)];
  for (const body of bodies) assert.equal((await run(async () => new Response(body, { headers: { "content-type": "application/json" } }))).state, "unknown");
  for (const headers of [{ "content-type": "text/html" }, { "content-type": "application/json", "content-length": "65537" }, { "content-type": "application/json", "content-length": "invalid" }]) {
    assert.equal((await run(async () => new Response(JSON.stringify(record()), { headers }))).state, "unknown");
  }
  for (const status of [301, 403, 429, 500]) assert.equal((await run(async () => json(record(), status))).state, "unknown");
  for (const field of ["redirected", "url"]) {
    const response = json(record()); Object.defineProperty(response, field, { value: field === "url" ? "https://invalid.example" : true });
    assert.equal((await run(async () => response)).state, "unknown");
  }
  const bytes = new TextEncoder().encode(JSON.stringify({ ...record(), name: "é" }));
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  assert.equal((await run(async () => new Response(stream, { headers: { "content-type": "application/json" } }))).state, "new_release_available");
});

for (const phase of ["fetch", "body", "fallback"] as const) test(`two-second aggregate deadline bounds stalled ${phase}`, async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | null | undefined;
  let calls = 0;
  let canceled = false;
  const pending = run(async (_url, init) => {
    signal = init!.signal; calls++;
    if (phase === "fetch") return new Promise<Response>(() => {});
    if (phase === "fallback" && calls === 1) {
      await new Promise(resolve => setTimeout(resolve, 1500)); return json({}, 404);
    }
    return new Response(new ReadableStream<Uint8Array>({ cancel() { canceled = true; } }), { headers: { "content-type": "application/json" } });
  });
  await flush();
  if (phase === "fallback") { t.mock.timers.tick(1500); await flush(); assert.equal(calls, 2); }
  t.mock.timers.tick(phase === "fallback" ? 499 : 1999); await flush();
  assert.equal(signal!.aborted, false);
  t.mock.timers.tick(1);
  assert.equal((await pending).state, "unknown"); assert.equal(signal!.aborted, true);
  if (phase !== "fetch") assert.equal(canceled, true);
});

test("SemVer precedence includes large numeric identifiers and ignores build metadata", async () => {
  const ordered = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0"];
  for (let i = 1; i < ordered.length; i++) {
    assert.equal(compareReleaseVersions(ordered[i - 1]!, ordered[i]!), -1);
    assert.equal(compareReleaseVersions(ordered[i]!, ordered[i - 1]!), 1);
  }
  for (const [a, b] of [["9007199254740992.0.0", "9007199254740993.0.0"], ["1.0.0-9007199254740992", "1.0.0-9007199254740993"]]) assert.equal(compareReleaseVersions(a!, b!), -1);
  assert.equal(compareReleaseVersions("1.2.3+a", "1.2.3+b"), 0);
  assert.equal(compareReleaseVersions("1.2.3-rc.1", "1.2.3-rc.1"), 0);
  for (const invalid of ["v1.2.3", "01.2.3", "1.2.3-01", "1.2", "1.2.3\n", "x".repeat(129)]) assert.equal(compareReleaseVersions(invalid, "1.2.3"), null);
  for (const local of ["1.2.3", "1.2.3+local", "2.0.0-rc.1"]) assert.equal((await run(async () => json(record()), local)).state, "no_newer_version_observed");
});

for (const failure of [false, true]) test(`${failure ? "failure" : "success"} cache expires at its exact TTL`, async t => {
  const root = await mkdtemp(join(tmpdir(), "release-cache-")); t.after(() => rm(root, { recursive: true, force: true }));
  let now = NOW, calls = 0;
  const deps = { now: () => now, fetch: async () => { calls++; return json(record(), failure ? 503 : 200); } };
  await checkRelease("1.2.3-rc.1", { cacheDirectory: root }, deps);
  const ttl = failure ? 300000 : 86400000;
  now += ttl - 1;
  const hit = await checkRelease("2.0.0", { cacheDirectory: root }, deps);
  assert.equal(hit.observation_source, "cache"); assert.equal(hit.checked_at, NOW); assert.equal(calls, 1);
  assert.equal(hit.state, failure ? "unknown" : "no_newer_version_observed");
  now++;
  assert.equal((await checkRelease("2.0.0", { cacheDirectory: root }, deps)).observation_source, "network"); assert.equal(calls, 2);
  assert.equal((await lstat(join(root, "release-observation.json"))).mode & 0o777, 0o600);
});

test("invalid cache timestamps, schema, duplicates and size are ignored", async t => {
  const root = await mkdtemp(join(tmpdir(), "release-cache-")); t.after(() => rm(root, { recursive: true, force: true }));
  const valid = { format: "bl-release-observation-0.1", checked_at: NOW, observation: { state: "unknown" } };
  const invalid = [ ...[NOW + 1, -1, 0.5, "today"].map(checked_at => JSON.stringify({ ...valid, checked_at })),
    JSON.stringify({ ...valid, format: "future" }), JSON.stringify({ ...valid, extra: true }),
    JSON.stringify(valid).replace('"state":"unknown"', '"state":"unknown","state":"unknown"'), " ".repeat(1025),
    JSON.stringify({ ...valid, observation: { state: "release_metadata", tag: "v1.2.3", published_at: "2027-01-01T00:00:00Z" } }) ];
  for (const bytes of invalid) {
    await writeFile(join(root, "release-observation.json"), bytes);
    assert.equal((await checkRelease("1.2.3", { cacheDirectory: root }, { now: () => NOW, fetch: async () => json(record()) })).observation_source, "network");
  }
});

test("cache symlinks, hardlinks, directories and FIFO are neither followed nor overwritten", async t => {
  const root = await mkdtemp(join(tmpdir(), "release-cache-")); t.after(() => rm(root, { recursive: true, force: true }));
  const target = join(root, "target"); await writeFile(target, "SYNTHETIC_SENTINEL");
  for (const kind of ["symlink", "hardlink", "directory", "fifo"]) {
    const dir = join(root, kind); await mkdir(dir); const path = join(dir, "release-observation.json");
    if (kind === "symlink") await symlink(target, path);
    if (kind === "hardlink") await link(target, path);
    if (kind === "directory") await mkdir(path);
    if (kind === "fifo") assert.equal(spawnSync("mkfifo", [path]).status, 0);
    assert.equal((await checkRelease("1.2.3", { cacheDirectory: dir }, { now: () => NOW, fetch: async () => json(record()) })).state, "no_newer_version_observed");
    assert.equal(await readFile(target, "utf8"), "SYNTHETIC_SENTINEL");
  }
  const linkedDir = join(root, "linked-dir"); await symlink(join(root, "directory"), linkedDir);
  assert.equal((await checkRelease("1.2.3", { cacheDirectory: linkedDir }, { now: () => NOW, fetch: async () => json(record()) })).observation_source, "network");
});

test("disabled checking does not access cache options or transport; invalid local inputs make no request", async t => {
  const root = await mkdtemp(join(tmpdir(), "release-disabled-")); t.after(() => rm(root, { recursive: true, force: true }));
  const options = { disabled: true, get cacheDirectory(): string { throw new Error("disabled cache access"); } };
  const deps = { now: () => NOW, fetch: async (): Promise<Response> => assert.fail("unexpected request") };
  assert.equal((await checkRelease("1.2.3", options, deps)).state, "disabled");
  await checkRelease("1.2.3", { disabled: true, cacheDirectory: join(root, "missing") }, deps);
  assert.deepEqual(await readdir(root), []);
  assert.equal((await checkRelease("PRIVATE_SENTINEL", {}, deps)).local_version, "unknown");
  assert.equal((await checkRelease("1.2.3", {}, { ...deps, now: () => NOW + 0.5 })).observation_source, "none");
});
