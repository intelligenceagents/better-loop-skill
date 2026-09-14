import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const pkg = new URL("packages/contracts/", root);
const packed = JSON.parse(execFileSync("npm", ["pack", "--workspace", "@better-loop/contracts", "--dry-run", "--json"], { encoding: "utf8" }))[0];
const allowed = /^(?:package\.json|README\.md|LICENSE|THIRD_PARTY_NOTICES\.md|schemas\/(?:share-candidate|evaluation-run)\.schema\.json|dist\/(?:index\.js|index\.cjs|cli\.js|(?:index|canonicalize|parse-json|digest|validation|cli)\.d\.(?:ts|cts)|generated\/(?:share-candidate|evaluation-run)\.d\.ts))$/;
for (const item of packed.files) {
  assert.match(item.path, allowed, `Unexpected packed path: ${item.path}`);
  const text = await readFile(new URL(item.path, pkg), "utf8");
  assert.doesNotMatch(text, /\/Users\/|\/home\/|file:\/\/|sourceMappingURL|\.env(?:\.|")/i, `Unwanted local metadata in ${item.path}`);
}
for (const name of ["share-candidate", "evaluation-run"]) {
  const source = await readFile(new URL(`schemas/${name}.schema.json`, root));
  const distributed = await readFile(new URL(`schemas/${name}.schema.json`, pkg));
  assert.deepEqual(distributed, source, `Schema bytes changed: ${name}`);
}
assert.equal(packed.name, "@better-loop/contracts");
assert.equal(packed.version, "0.1.0-draft.1");
const metadata = JSON.parse(await readFile(new URL("package.json", pkg), "utf8"));
assert.equal(metadata.dependencies, undefined, "Packed runtime must be self-contained");
const esm = await import(new URL("dist/index.js", pkg));
const { createRequire } = await import("node:module");
const cjs = createRequire(import.meta.url)(new URL("dist/index.cjs", pkg).pathname);
assert.equal(cjs.canonicalize({ b: 2, a: 1 }), esm.canonicalize({ b: 2, a: 1 }));
const generated = await readdir(new URL("dist/generated/", pkg));
assert.ok(generated.every(name => name.endsWith(".d.ts")));
console.log(`PASS: ${packed.files.length} allowlisted package files; identical schema bytes; self-contained ESM/CommonJS imports.`);
