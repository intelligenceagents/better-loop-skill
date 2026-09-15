import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, openSync, closeSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire, isBuiltin } from "node:module";
import { isDeepStrictEqual } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const relativeFolder = "evals/public-repair-proof";
const evaluatorVersion = "bl-evidence-attribution-repair-0.2";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const git = (...args) => execFileSync("git", args, {
  cwd: root, timeout: 5000, maxBuffer: 4 * 1024 * 1024, encoding: "utf8",
});
const canonicalPath = (path) => path.split(sep).join("/");
const safeError = (error) => ({
  name: typeof error?.name === "string" ? error.name : "Error",
  code: typeof error?.code === "string" ? error.code : "execution_failed",
});
const demand = (condition, code) => {
  if (!condition) throw Object.assign(new Error(code), { code });
};

function verify() {
  const freeze = json(resolve(here, "FREEZE-v0.2.json"));
  demand(freeze.evaluator_version === evaluatorVersion, "evaluator_version_mismatch");
  demand(process.version === freeze.runtime.node, "node_version_mismatch");
  demand(process.platform === freeze.runtime.platform && process.arch === freeze.runtime.arch,
    "runtime_platform_mismatch");
  // FREEZE-v0.2.json is committed once, before execution; result commits never rewrite it.
  const freezeCommit = git("log", "-1", "--format=%H", "--", `${relativeFolder}/FREEZE-v0.2.json`).trim();
  demand(/^[a-f0-9]{40}$/.test(freezeCommit), "freeze_not_committed");
  for (const [path, expected] of Object.entries(freeze.frozen_files)) {
    const bytes = readFileSync(resolve(here, path));
    demand(sha(bytes) === expected, "frozen_file_changed");
    demand(sha(Buffer.from(git("show", `${freezeCommit}:${relativeFolder}/${path}`))) === expected,
      "file_not_in_freeze_commit");
  }
  demand(git("show", `${freezeCommit}:${relativeFolder}/FREEZE-v0.2.json`) ===
    readFileSync(resolve(here, "FREEZE-v0.2.json"), "utf8"), "freeze_manifest_changed");
  for (const [path, expected] of Object.entries(freeze.cached_files)) {
    demand(sha(readFileSync(resolve(root, path))) === expected, "cached_dependency_changed");
  }
  for (const arm of freeze.arms) {
    demand(sha(Buffer.from(git("show", `${arm.commit}:${arm.source_path}`))) === arm.source_sha256,
      "source_hash_mismatch");
    demand(sha(Buffer.from(git("show", `${arm.commit}:packages/evidence/package.json`))) ===
      arm.package_sha256, "package_hash_mismatch");
    for (const [path, tree] of Object.entries(freeze.dependency_source_trees)) {
      demand(git("rev-parse", `${arm.commit}:${path}`).trim() === tree, "dependency_source_changed");
    }
  }
  const cases = json(resolve(here, "cases.json"));
  demand(cases.length === 24 && new Set(cases.map((item) => item.id)).size === 24, "case_count_changed");
  return { freeze, freezeCommit, cases };
}

async function worker(armName, directory) {
  const { freeze, cases } = verify();
  const arm = freeze.arms.find((item) => item.arm === armName);
  demand(arm, "unknown_arm");
  const sourcePath = resolve(directory, "evidence.ts");
  writeFileSync(sourcePath, git("show", `${arm.commit}:${arm.source_path}`), { flag: "wx" });
  const require = createRequire(resolve(root, "package.json"));
  const esbuild = require("esbuild");
  demand(esbuild.version === freeze.compiler.version, "compiler_version_mismatch");
  const built = esbuild.buildSync({
    entryPoints: [sourcePath], absWorkingDir: root, bundle: true,
    platform: "neutral", target: "es2022", format: "esm", write: false, metafile: true,
    alias: {
      "@better-loop/contracts": resolve(root, "packages/contracts/dist/index.js"),
      "@better-loop/privacy": resolve(root, "packages/privacy/dist/index.js"),
      "@noble/hashes": resolve(root, "node_modules/@noble/hashes"),
    },
    logLevel: "silent",
  });
  const canonicalSource = realpathSync(sourcePath);
  const frozenCanonicalInputs = new Set(Object.keys(freeze.cached_files)
    .map((path) => realpathSync(resolve(root, path))));
  for (const input of Object.keys(built.metafile.inputs)) {
    const absolute = realpathSync(resolve(root, input));
    if (absolute === canonicalSource) continue;
    if (!frozenCanonicalInputs.has(absolute)) {
      // Local-only diagnostic. Public results retain the fixed error code.
      console.error(JSON.stringify({ unexpected_compiler_input: canonicalPath(relative(root, absolute)) }));
      demand(false, "unfrozen_compiler_input");
    }
  }
  for (const output of Object.values(built.metafile.outputs)) {
    demand(output.imports.every((item) => !item.external || isBuiltin(item.path)), "external_runtime_import");
  }
  const bundle = built.outputFiles[0].contents;
  const modulePath = resolve(directory, "evidence.mjs");
  writeFileSync(modulePath, bundle, { flag: "wx" });
  const implementation = await import(pathToFileURL(modulePath).href);
  demand(implementation.EVIDENCE_VERSION === arm.package_version, "compiled_package_version_mismatch");
  const results = cases.map((probe) => {
    const input = structuredClone(probe.input);
    const original = structuredClone(input);
    let result;
    let exception = null;
    try { result = implementation.validateContribution(input); }
    catch (error) { exception = safeError(error); }
    const observedValid = typeof result?.valid === "boolean" ? result.valid : null;
    const inputUnchanged = isDeepStrictEqual(input, original);
    const acceptedDataPreserved = observedValid === true ? isDeepStrictEqual(result.data, original) : null;
    return {
      id: probe.id, group: probe.group, expected_valid: probe.expected_valid,
      observed_valid: observedValid, input_unchanged: inputUnchanged,
      accepted_data_preserved: acceptedDataPreserved, exception,
      findings: observedValid === false ? result.errors : [],
      pass: exception === null && observedValid === probe.expected_valid && inputUnchanged &&
        (observedValid !== true || acceptedDataPreserved === true),
    };
  });
  writeFileSync(resolve(directory, "arm.json"), JSON.stringify({
    arm: armName, source_commit: arm.commit, source_sha256: arm.source_sha256,
    package_version: implementation.EVIDENCE_VERSION, compiled_bundle_sha256: sha(bundle),
    compiler_inputs_verified: true, results,
  }, null, 2) + "\n", { flag: "wx" });
}

function main() {
  const started = Date.now();
  const { freeze, freezeCommit } = verify();
  const options = process.argv.slice(2);
  demand(options.length === 0 || (options.length === 2 && options[0] === "--output"), "invalid_arguments");
  const destination = options.length ? resolve(options[1]) : resolve(here, "RESULTS-v0.2.json");
  // Reserve the output before execution; the final write uses this owned descriptor.
  const outputDescriptor = openSync(destination, "wx", 0o644);
  const temporary = mkdtempSync(resolve(tmpdir(), "bl-evidence-repair-"));
  const arms = [];
  const infrastructure = [];
  for (const arm of freeze.arms) {
    const directory = resolve(temporary, arm.arm);
    mkdirSync(directory);
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--worker", arm.arm, directory], {
      cwd: root, encoding: "utf8", timeout: Math.min(50_000, Math.max(1, 115_000 - (Date.now() - started))),
      maxBuffer: 256 * 1024,
    });
    if (child.status === 0) arms.push(json(resolve(directory, "arm.json")));
    else {
      infrastructure.push({
        arm: arm.arm, status: child.status, signal: child.signal,
        error: child.error ? safeError(child.error) : { code: "worker_failed" },
      });
      // Local diagnostics may contain compiler paths; they are not public results.
      writeFileSync(resolve(directory, "diagnostics.txt"), child.stderr ?? "", { flag: "wx" });
    }
  }
  const aggregate = (results) => ({
    passed: results.filter((item) => item.pass).length, total: results.length,
    expected_acceptance: {
      passed: results.filter((item) => item.expected_valid && item.pass).length,
      total: results.filter((item) => item.expected_valid).length,
    },
    expected_rejection: {
      passed: results.filter((item) => !item.expected_valid && item.pass).length,
      total: results.filter((item) => !item.expected_valid).length,
    },
  });
  for (const arm of arms) {
    arm.counts = aggregate(arm.results);
    arm.groups = Object.fromEntries(["repair_F1", "repair_F2", "positive_control", "negative_control"]
      .map((group) => [group, aggregate(arm.results.filter((item) => item.group === group))]));
  }
  const before = arms.find((item) => item.arm === "before");
  const after = arms.find((item) => item.arm === "after");
  const paired = before && after;
  const changes = paired ? {
    repaired: after.results.filter((item, i) => item.pass && !before.results[i].pass).map((item) => item.id),
    regressed: after.results.filter((item, i) => !item.pass && before.results[i].pass).map((item) => item.id),
    unchanged_pass: after.results.filter((item, i) => item.pass && before.results[i].pass).map((item) => item.id),
    unchanged_fail: after.results.filter((item, i) => !item.pass && !before.results[i].pass).map((item) => item.id),
    pass_count_delta: after.counts.passed - before.counts.passed,
    pass_fraction_percentage_point_delta: Number(((after.counts.passed - before.counts.passed) / 24 * 100).toFixed(2)),
  } : null;
  const report = {
    schema_version: "bl-public-repair-result-0.1", evaluator_version: evaluatorVersion,
    demonstration_kind: "known_case_matched_software_regression", execution_order: ["before", "after"],
    input_origin: "authored_synthetic_validation_probes_against_actual_public_software",
    freeze_commit: freezeCommit, freeze_sha256: sha(readFileSync(resolve(here, "FREEZE-v0.2.json"))),
    executed_at_utc: new Date(started).toISOString(), runtime: freeze.runtime, compiler: freeze.compiler,
    elapsed_wall_ms: Date.now() - started, wall_duration_use: "execution_bound_only_not_an_efficiency_measure",
    model_calls: 0, approvals_created: 0, contributions_submitted: 0,
    measured_model_tokens: null, measured_cash_cost: null, measured_human_effort: null,
    infrastructure_failures: infrastructure, arms, changes,
    quality_floor_met: !!paired && infrastructure.length === 0 && after.counts.passed === 24 &&
      changes.regressed.length === 0 && Date.now() - started < 120_000,
    limitations: freeze.limitations,
  };
  writeFileSync(outputDescriptor, JSON.stringify(report, null, 2) + "\n");
  closeSync(outputDescriptor);
  console.log(JSON.stringify({
    freeze_commit: freezeCommit, arms: arms.map(({ arm, counts }) => ({ arm, counts })),
    quality_floor_met: report.quality_floor_met, infrastructure_failures: infrastructure.length,
  }, null, 2));
  if (infrastructure.length) process.exitCode = 1;
}

try {
  if (process.argv[2] === "--worker") {
    demand(process.argv.length === 5, "invalid_worker_arguments");
    await worker(process.argv[3], process.argv[4]);
  } else {
    main();
  }
} catch (error) {
  console.error(JSON.stringify(safeError(error)));
  process.exitCode = 1;
}
