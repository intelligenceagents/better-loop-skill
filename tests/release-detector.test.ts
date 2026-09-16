import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const detector = resolve("skills/better-loop/scripts/detect-helper.mjs");
const cli = resolve("packages/cli/dist/cli.js");
const versions = { contracts: "0.1.0-draft.1", core: "0.2.0-draft.1", adapters: "0.2.0-draft.1",
  privacy: "0.1.0-draft.3", measurement: "0.1.0-draft.1", journey: "0.2.0-draft.3",
  evidence: "0.1.0-draft.2", discovery: "0.2.0-draft.1", handoff: "0.1.0-draft.2" };
const capability = () => ({ protocol: "bl-capabilities-0.2", helper_version: "0.5.0-draft.1", packages: { ...versions },
  capabilities: { explicit_repository_journey: true, persisted_host_assessment: true, selected_assessment: true,
    descriptive_indicators: 11, release_check: "fixed_public_github_metadata_only_no_update",
    personal_coach: "explicit_preferences_scoped_plan_apply_rollback",
    shared_practice: "controlled_challenges_related_lessons_descriptive_progress",
    upload: false, calibrated_ranking: false } });

test("detector requires all ten exact package versions and release-check capability", async t => {
  const root = await mkdtemp(join(tmpdir(), "release-detector-")); t.after(() => rm(root, { recursive: true, force: true }));
  const guard = join(root, "detector-spy.mjs");
  await writeFile(guard, `import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
cp.execFileSync=(exe,args,opts)=>{
 if(exe!==process.execPath || JSON.stringify(args)!==JSON.stringify(['/synthetic/helper.mjs','capabilities','--json']) || opts.shell!==false || opts.timeout!==5000 || opts.maxBuffer!==16384) throw Error('bad invocation');
 return process.env.SYNTHETIC_CAPABILITIES;
}; syncBuiltinESMExports();
`);
  const invoke = (payload: unknown, args = ["/synthetic/helper.mjs"]) => spawnSync(process.execPath, ["--import", guard, detector, ...args], {
    encoding: "utf8", timeout: 10000, env: { ...process.env, SYNTHETIC_CAPABILITIES: JSON.stringify(payload) },
  });
  const good = invoke(capability()); assert.equal(good.status, 0, good.stderr); assert.equal(JSON.parse(good.stdout).state, "available");
  for (const key of ["helper_version", ...Object.keys(versions)]) {
    for (const value of ["999.0.0", undefined]) {
      const changed = capability();
      const target = key === "helper_version" ? changed : changed.packages;
      if (value === undefined) delete (target as Record<string, unknown>)[key];
      else (target as Record<string, unknown>)[key] = value;
      const result = invoke(changed); assert.equal(result.status, 1, key);
      assert.deepEqual(JSON.parse(result.stdout), { state: "incompatible", protocol: "bl-capabilities-0.2", capabilities: null });
    }
  }
  for (const value of [undefined, false, true, "fixed_public_github_metadata_only_no_update_v2"]) {
    const changed = capability(); (changed.capabilities as Record<string, unknown>).release_check = value;
    assert.equal(JSON.parse(invoke(changed).stdout).state, "incompatible");
  }
  for (const key of ["personal_coach", "shared_practice"]) {
    for (const value of [undefined, false, true, "unsupported_v2"]) {
      const changed = capability(); (changed.capabilities as Record<string, unknown>)[key] = value;
      assert.equal(JSON.parse(invoke(changed).stdout).state, "incompatible");
    }
  }
  for (const args of [["relative.mjs"], ["/synthetic/helper.mjs", "extra"]]) assert.equal(JSON.parse(invoke(capability(), args).stdout).state, "unavailable");
});

test("built helper help, capabilities and disabled release checks perform no network or selected-cache IO", async t => {
  const root = await mkdtemp(join(tmpdir(), "release-cli-")); t.after(() => rm(root, { recursive: true, force: true }));
  const guard = join(root, "guard.mjs"), marker = join(root, "violations");
  await writeFile(guard, `import fs from 'node:fs'; import fsp from 'node:fs/promises'; import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import {syncBuiltinESMExports} from 'node:module';
const fail=()=>{fs.appendFileSync(process.env.SPY_MARKER,'VIOLATION\\n'); throw Error('UNEXPECTED_IO');};
globalThis.fetch=fail; for(const module of [http,https]) {module.request=fail;module.get=fail;} net.connect=fail;net.createConnection=fail;
for(const key of ['open','readFile','writeFile','mkdir','lstat','stat','readdir']) {const original=fsp[key]; fsp[key]=function(path,...args){if(String(path).includes('NEVER_CACHE')) return fail();return original.call(this,path,...args);};}
syncBuiltinESMExports();
`);
  const cases = [["--help"], ["capabilities", "--json"], ["release-check", "--help", "--cache-dir", join(root, "NEVER_CACHE")],
    ["release-check", "--offline", "--json", "--cache-dir", join(root, "NEVER_CACHE")],
    ["release-check", "--disabled", "--json", "--cache-dir", join(root, "NEVER_CACHE")]];
  for (const args of cases) {
    const result = spawnSync(process.execPath, ["--import", guard, cli, ...args], { encoding: "utf8", timeout: 10000, env: { ...process.env, SPY_MARKER: marker } });
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, "");
    if (args[0] === "capabilities") {
      const value = JSON.parse(result.stdout);
      assert.equal(value.helper_version, "0.5.0-draft.1"); assert.deepEqual(value.packages, versions);
      assert.equal(value.capabilities.release_check, "fixed_public_github_metadata_only_no_update");
    } else if (args.includes("--json")) assert.equal(JSON.parse(result.stdout).state, "disabled");
    else assert.match(result.stdout, /release-check/);
  }
  await assert.rejects(readFile(marker), { code: "ENOENT" });
});

test("CLI release transport is fixed and emits no supplied remote prose", async t => {
  const root = await mkdtemp(join(tmpdir(), "release-cli-")); t.after(() => rm(root, { recursive: true, force: true }));
  const guard = join(root, "transport.mjs");
  await writeFile(guard, `globalThis.fetch=async(url,init)=>{
 if(url!=='https://api.github.com/repos/intelligenceagents/better-loop-skill/releases/latest'||init.credentials!=='omit'||init.redirect!=='error'||init.body!==undefined) throw Error('request mismatch');
 return new Response(JSON.stringify({id:1,draft:false,prerelease:false,tag_name:'v99.0.0',published_at:'2026-01-01T00:00:00Z',url:'https://api.github.com/repos/intelligenceagents/better-loop-skill/releases/1',html_url:'https://github.com/intelligenceagents/better-loop-skill/releases/tag/v99.0.0',body:'REMOTE_SENTINEL'}),{headers:{'content-type':'application/json'}});
};
`);
  const result = spawnSync(process.execPath, ["--import", guard, cli, "release-check", "--json"], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).state, "new_release_available");
  assert.doesNotMatch(result.stdout + result.stderr, /REMOTE_SENTINEL/);
});
