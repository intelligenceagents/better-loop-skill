import { mkdir, readFile, writeFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import standalone from "ajv/dist/standalone/index.js";
import { compile } from "json-schema-to-typescript";

const output = new URL("../packages/contracts/src/generated/", import.meta.url);
await mkdir(output, { recursive: true });
// The unchanged draft uses type constraints inherited into conditional subschemas.
// Relax only that schema-authoring lint; runtime validation remains strict.
const ajv = new Ajv2020({
  strict: true,
  strictTypes: false,
  allErrors: true,
  ownProperties: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
  code: { source: true },
});
addFormats(ajv, { mode: "full" });
for (const [name, type] of [
  ["share-candidate", "ShareCandidate"],
  ["evaluation-run", "EvaluationRun"],
]) {
  const schema = JSON.parse(await readFile(new URL(`../schemas/${name}.schema.json`, import.meta.url), "utf8"));
  const validator = ajv.compile(schema);
  await writeFile(new URL(`${name}.cjs`, output), standalone(ajv, validator));
  await writeFile(new URL(`${name}.d.cts`, output),
    'import type { ValidateFunction } from "ajv";\ndeclare const validate: ValidateFunction;\nexport = validate;\n');
  // Conditional constraints are runtime checks. Generate useful structural types
  // from the exact properties; never present TS assignability as validation.
  const shape = structuredClone(schema);
  function structural(node) {
    if (!node || typeof node !== "object") return;
    delete node.allOf;
    delete node.title;
    // `properties` is a name map, not a schema node. A property named "title"
    // is contract data and must survive metadata stripping.
    for (const child of Object.values(node.properties ?? {})) structural(child);
    if (node.items) structural(node.items);
  }
  structural(shape);
  await writeFile(new URL(`${name}.ts`, output), await compile(shape, type, {
    bannerComment: "/* Generated from the draft schema. Runtime validation is required. */",
    additionalProperties: false,
    ignoreMinAndMaxItems: true,
    unreachableDefinitions: true,
  }));
}
