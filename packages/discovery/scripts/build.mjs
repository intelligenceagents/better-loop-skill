import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const pkg = new URL("../", import.meta.url);
const root = new URL("../../../", import.meta.url);
const benchmark = new URL("evals/public-work-benchmark/", root);
execFileSync(process.execPath, [fileURLToPath(new URL("verify-freeze.mjs", benchmark))], { stdio: "inherit" });
const [registration, rubric, freeze] = await Promise.all(
  ["registration.json", "rubric.json", "freeze.json"].map(file => readFile(new URL(file, benchmark), "utf8")),
);
const generated = "// Generated from the committed public benchmark freeze. Build verifies exact equality.\n" +
  `export const FROZEN_REGISTRATION = ${registration.trim()} as const;\n` +
  `export const FROZEN_RUBRIC = ${rubric.trim()} as const;\n` +
  `export const FREEZE_SHA256 = "${createHash("sha256").update(freeze).digest("hex")}" as const;\n`;
if (await readFile(new URL("src/frozen-benchmark.ts", pkg), "utf8") !== generated) {
  throw new Error("frozen_benchmark_source_drift");
}
const resultBytes = await readFile(new URL("RESULTS.json", benchmark), "utf8");
const summary = JSON.parse(resultBytes).summary;
const resultsModule = "// Generated from the retained actual public execution report; build checks exact equality.\n" +
  `export const PUBLIC_RESULTS_SUMMARY = ${JSON.stringify(summary, null, 2)} as const;\n` +
  `export const PUBLIC_RESULTS_SHA256 = "${createHash("sha256").update(resultBytes).digest("hex")}" as const;\n`;
if (await readFile(new URL("src/benchmark-results.ts", pkg), "utf8") !== resultsModule) {
  throw new Error("retained_benchmark_results_drift");
}
const evidencePackage = JSON.parse(await readFile(new URL("packages/evidence/package.json", root), "utf8"));
if (evidencePackage.version !== "0.1.0-draft.2") throw new Error("review_evidence_version_before_build");
const evidenceTypes = await readFile(new URL("packages/evidence/dist/index.d.ts", root), "utf8");
if (!evidenceTypes.includes('export declare const EVIDENCE_VERSION: "0.1.0-draft.2";')) {
  throw new Error("build_pinned_evidence_package_first");
}
await mkdir(new URL("dist/vendor/", pkg), { recursive: true });
execFileSync(process.execPath, [
  fileURLToPath(new URL("node_modules/typescript/bin/tsc", root)), "-p", fileURLToPath(new URL("tsconfig.json", pkg)),
], { stdio: "inherit" });
const common = {
  bundle: true, platform: "browser", target: "es2022", sourcemap: false, legalComments: "inline", logLevel: "warning",
  entryPoints: [fileURLToPath(new URL("src/index.ts", pkg))],
  alias: { "@better-loop/evidence": fileURLToPath(new URL("packages/evidence/src/index.ts", root)) },
};
await Promise.all([
  build({ ...common, format: "esm", outfile: fileURLToPath(new URL("dist/index.js", pkg)) }),
  build({ ...common, format: "cjs", outfile: fileURLToPath(new URL("dist/index.cjs", pkg)) }),
]);
// Preserve source imports from the owning package. Package self-contained declarations from its
// emitted top-level declarations, never a separately maintained alternative capability schema.
const required = new Set(["CAPABILITY_SCHEMA_VERSION", "WORK_EVIDENCE_RUBRIC", "CONTRIBUTION_POLICY_VERSION",
  "HUMAN_ACTIONS", "QUALITY_DIMENSIONS", "HumanAction", "QualityDimension", "CheckResult", "CapabilityEvidence", "ContributionConsent"]);
const selected = evidenceTypes.split(/(?=^export )/m).filter(declaration => {
  const name = /^export (?:declare )?(?:const|type|interface) ([A-Za-z_][A-Za-z0-9_]*)\b/.exec(declaration)?.[1];
  if (!name || !required.has(name)) return false;
  required.delete(name);
  return true;
});
if (required.size) throw new Error("review_changed_evidence_declarations");
await writeFile(new URL("dist/vendor/evidence.d.ts", pkg),
  "// Extracted from @better-loop/evidence 0.1.0-draft.2 emitted declarations.\n" +
  selected.join("\n") + "\n");
await copyFile(new URL("packages/contracts/dist/generated/share-candidate.d.ts", root), new URL("dist/vendor/share-candidate.d.ts", pkg));
for (const file of await readdir(new URL("dist/", pkg))) {
  if (!file.endsWith(".d.ts")) continue;
  const path = new URL(`dist/${file}`, pkg);
  await writeFile(path, (await readFile(path, "utf8"))
    .replaceAll('"@better-loop/evidence"', '"./vendor/evidence.js"')
    .replaceAll('"@better-loop/contracts"', '"./vendor/share-candidate.js"'));
}
await Promise.all([
  copyFile(new URL("dist/index.d.ts", pkg), new URL("dist/index.d.cts", pkg)),
  copyFile(new URL("LICENSE", root), new URL("LICENSE", pkg)),
  copyFile(new URL("packages/contracts/THIRD_PARTY_NOTICES.md", root), new URL("THIRD_PARTY_NOTICES.md", pkg)),
]);
