import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { fixture } from "./fixture.js";

const packageRoot = resolve(".");
const workspaceRoot = resolve("../..");
const output = resolve("test-output");
mkdirSync(output, { recursive: true });
const packed = JSON.parse(execFileSync("npm", ["pack", "--pack-destination", output, "--json"], { encoding: "utf8" }))[0];
for (const file of packed.files as { path: string }[])
  assert.match(file.path, /^(?:dist\/[^/]+|README\.md|LICENSE|package\.json)$/);
assert.ok(packed.files.some((file: { path: string }) => file.path === "dist/sender.inline.js"));
const dependencies = [
  "better-loop-contracts-0.1.0-draft.1.tgz",
  "better-loop-privacy-0.1.0-draft.3.tgz",
  "better-loop-evidence-0.1.0-draft.2.tgz",
].map(name => resolve(workspaceRoot, "artifacts", name));
for (const archive of dependencies) assert.ok(existsSync(archive), "Build/pack the pinned dependency archives first.");
const consumer = mkdtempSync(resolve(output, "consumer-"));
writeFileSync(resolve(consumer, "package.json"), JSON.stringify({ name: "handoff-offline-consumer", private: true, type: "module" }));
execFileSync("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund",
  ...dependencies, resolve(output, packed.filename)], { cwd: consumer, stdio: "pipe" });
writeFileSync(resolve(consumer, "fixture.json"), JSON.stringify(await fixture()));
const runtime = `
const approval=JSON.parse(fs.readFileSync(new URL("./fixture.json",moduleURL),"utf8"));
assert.equal(approval.helper_version,"0.1.0-draft.2");
assert.equal(typeof receiver.receiveHandoff,"function");
await assert.rejects(sender.startHandoff({...approval,helper_version:"0.1.0-draft.1"},
 {targetOrigin:"http://127.0.0.1:3100"}),/invalid_handoff_approval/);
const server=await sender.startHandoff(approval,{targetOrigin:"http://127.0.0.1:3100"});
try {
 const response=await fetch(server.url);
 assert.equal(response.status,200);
 assert.match(await response.text(),/Exact contribution, capability evidence and consent/);
} finally {await server.close();}
`;
writeFileSync(resolve(consumer, "esm.mjs"), `
import assert from "node:assert/strict";
import fs from "node:fs";
import * as sender from "@better-loop/handoff";
import * as receiver from "@better-loop/handoff/browser";
const moduleURL=import.meta.url;
${runtime}`);
writeFileSync(resolve(consumer, "cjs.cjs"), `
const assert=require("node:assert/strict"), fs=require("node:fs");
const sender=require("@better-loop/handoff"), receiver=require("@better-loop/handoff/browser");
const moduleURL=require("node:url").pathToFileURL(__filename);
(async()=>{${runtime}})().catch(()=>{process.exitCode=1;});
`);
for (const mode of ["esm.mjs", "cjs.cjs"])
  execFileSync(process.execPath, [mode], { cwd: consumer, stdio: "pipe" });
writeFileSync(resolve(consumer, "esm.mts"), `
import {startHandoff, type LocalHandoff} from "@better-loop/handoff";
import {receiveHandoff, type HandoffReceiver} from "@better-loop/handoff/browser";
const start: typeof startHandoff = startHandoff;
const receive: ()=>HandoffReceiver|null = receiveHandoff;
type Closed = Awaited<ReturnType<LocalHandoff["close"]>>;
const closed: Closed = undefined;
void start;void receive;void closed;
`);
writeFileSync(resolve(consumer, "common.cts"), `
import sender = require("@better-loop/handoff");
import receiver = require("@better-loop/handoff/browser");
const start: typeof sender.startHandoff = sender.startHandoff;
const receive: ()=>receiver.HandoffReceiver|null = receiver.receiveHandoff;
void start;void receive;
`);
writeFileSync(resolve(consumer, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    strict: true, noEmit: true, target: "ES2022", lib: ["ES2022", "DOM"],
    module: "NodeNext", moduleResolution: "NodeNext",
  },
  files: ["esm.mts", "common.cts"],
}));
execFileSync(process.execPath, [resolve(workspaceRoot, "node_modules/typescript/bin/tsc"), "-p", "."],
  { cwd: consumer, stdio: "pipe", encoding: "utf8" });
const browser = await build({
  stdin: { contents: 'export {receiveHandoff} from "@better-loop/handoff/browser";', resolveDir: consumer },
  bundle: true, write: false, platform: "browser", format: "esm", target: "es2022", metafile: true,
});
assert.equal(Object.keys(browser.metafile!.inputs).some(name => /handoff\/dist\/index\./.test(name)), false);
assert.doesNotMatch(browser.outputFiles[0]!.text, /node:http|node:fs|node:crypto/);
assert.ok(readFileSync(resolve(packageRoot, "LICENSE"), "utf8").startsWith("MIT License"));
console.log("PASS packed offline ESM/CJS runtime, browser-only bundle, both declaration modes and sender asset");
