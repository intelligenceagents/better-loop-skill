import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const names = ["contracts", "core", "adapters", "privacy", "measurement", "evidence", "discovery", "handoff", "journey", "cli"];
const run = (cwd, command, args) => execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
const git = (cwd, args) => run(cwd, "git", args).trim();
const hash = (bytes, algorithm, encoding) => createHash(algorithm).update(bytes).digest(encoding);
const inside = (root, path) => { const r = relative(root, path); return r === "" || (!r.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && r !== ".." && !isAbsolute(r)); };

export async function prepareCandidate({ repository = process.cwd(), output, label }) {
  if (typeof label !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(label)) throw new Error("candidate_label_required: use 1–80 letters, digits, dots, underscores or hyphens");
  if (typeof output !== "string" || !output) throw new Error("new_output_directory_required");
  const root = await realpath(git(repository, ["rev-parse", "--show-toplevel"]));
  const clean = () => {
    if (git(root, ["ls-files", "-v"]).split("\n").some(line => /^[a-zS] /.test(line))) throw new Error("hidden_index_flags: clear assume-unchanged and skip-worktree before preparation");
    // Includes staged, unstaged, deleted and nonignored untracked files.
    if (git(root, ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"])) throw new Error("dirty_source: commit or remove source changes before preparing a candidate");
  };
  clean();
  const sha = git(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (git(root, ["ls-tree", "-r", sha]).split("\n").some(line => line.startsWith("160000 "))) throw new Error("submodules_not_supported_by_source_archive");
  const destination = join(await realpath(dirname(resolve(output))), basename(resolve(output)));
  if (inside(root, destination)) throw new Error("output_must_be_outside_source_checkout");
  // Exclusive reservation: an existing directory or symlink is never overwritten.
  await mkdir(destination);
  const temporary = await mkdtemp(join(tmpdir(), "better-loop-candidate-"));
  try {
    const sourceArchive = join(destination, "source.tar.gz");
    const skillArchive = join(destination, "skill.tar.gz");
    run(root, "git", ["archive", "--format=tar.gz", `--output=${sourceArchive}`, sha]);
    run(root, "git", ["archive", "--format=tar.gz", `--output=${skillArchive}`, sha, "skills/better-loop"]);
    const source = join(temporary, "source");
    await mkdir(source);
    run(temporary, "tar", ["-xzf", sourceArchive, "-C", source]);
    const sourceManifests = new Map();
    for (const name of names) sourceManifests.set(name, JSON.parse(await readFile(join(source, "packages", name, "package.json"), "utf8")));
    const sourceCli = sourceManifests.get("cli");
    if (sourceCli.name !== "@better-loop/cli" || typeof sourceCli.version !== "string") throw new Error("invalid_source_cli_manifest");
    const checks = [];
    const check = async (name, command, args) => {
      process.stderr.write(`Candidate check: ${name}\n`);
      const log = run(source, command, args);
      // Build logs stay temporary: they may contain local environment paths.
      await writeFile(join(temporary, `${checks.length}.log`), log);
      checks.push(name);
    };
    await check("offline_locked_dependency_install", "npm", ["ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"]);
    await check("source_check_including_build_and_package_metadata", "npm", ["run", "check"]);
    await check("source_build_offline_consumers_and_declarations", "npm", ["run", "test:consumer"]);
    await check("pack_local", process.execPath, ["tools/pack-local.mjs"]);
    const packed = JSON.parse(await readFile(join(source, "artifacts/local-release.json"), "utf8"));
    if (packed.format !== "bl-local-package-set-0.1" || packed.publication !== "local_archives_only" || !Array.isArray(packed.packages) || packed.packages.length !== names.length) throw new Error("invalid_package_set");
    const packages = [];
    for (const name of names) {
      const entries = packed.packages.filter(p => p.name === `@better-loop/${name}`);
      if (entries.length !== 1) throw new Error("invalid_package_set_members");
      const entry = entries[0];
      if (typeof entry.filename !== "string" || !/^[a-zA-Z0-9._-]+\.tgz$/.test(entry.filename)) throw new Error("invalid_archive_filename");
      const path = join(source, "artifacts", entry.filename);
      const bytes = await readFile(path);
      const metadata = JSON.parse(run(source, "tar", ["-xOf", path, "package/package.json"]));
      const manifest = sourceManifests.get(name);
      const sha256 = hash(bytes, "sha256", "hex");
      const integrity = `sha512-${hash(bytes, "sha512", "base64")}`;
      if (entry.sha256 !== sha256 || entry.integrity !== integrity || metadata.name !== entry.name || manifest.name !== entry.name || metadata.version !== manifest.version || entry.version !== manifest.version) throw new Error("archive_receipt_or_source_metadata_mismatch");
      await copyFile(path, join(destination, entry.filename));
      packages.push({ name: entry.name, version: entry.version, filename: entry.filename, sha256, integrity });
    }
    // Install the exact recorded bytes, not just a second npm pack of this build.
    const consumer = join(temporary, "consumer");
    await mkdir(consumer);
    await writeFile(join(consumer, "package.json"), JSON.stringify({ name: "synthetic-candidate-consumer", private: true, type: "module", dependencies: Object.fromEntries(packages.map(p => [p.name, `file:${join(destination, p.filename)}`])) }));
    for (const action of ["install", "ci"]) run(consumer, "npm", [action, "--offline", "--ignore-scripts", "--no-audit", "--no-fund"]);
    await writeFile(join(consumer, "smoke.mjs"), `import {createRequire} from 'node:module';\nconst require=createRequire(import.meta.url);\nfor(const name of ${JSON.stringify(packages.map(p => p.name))}) { await import(name); require(name); }\n`);
    run(consumer, process.execPath, ["smoke.mjs"]);
    checks.push("exact_ten_archives_offline_install_ci_esm_cjs");
    clean();
    if (git(root, ["rev-parse", "HEAD"]) !== sha) throw new Error("source_head_changed_during_preparation");
    const archives = [];
    for (const filename of ["source.tar.gz", "skill.tar.gz"]) archives.push({ filename, sha256: hash(await readFile(join(destination, filename)), "sha256", "hex") });
    const receipt = {
      format: "bl-release-candidate-0.1", state: "local_candidate_prepared", candidate_label: label,
      source_sha: sha, source_cli_version: sourceCli.version, archives, packages, checks,
      node_version: process.version, npm_version: run(source, "npm", ["--version"]).trim(),
      publication: "none", tag: null, signature: null,
      verification_scope: "deterministic_build_and_package_checks_only",
    };
    await writeFile(join(destination, "local-release.json"), JSON.stringify(packed, null, 2) + "\n");
    // Written last; absent on failure. Partial output is retained for operator inspection.
    await writeFile(join(destination, "candidate.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
    return receipt;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = { "--output": "output", "--label": "label" }[args[i]];
    if (!key || Object.hasOwn(options, key) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("usage: node tools/prepare-release-candidate.mjs --output NEW_DIRECTORY --label CANDIDATE_LABEL");
    options[key] = args[i + 1];
  }
  return options;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await prepareCandidate(parseArgs(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(`Candidate preparation failed: ${error.message}`); process.exitCode = 1; }
}
