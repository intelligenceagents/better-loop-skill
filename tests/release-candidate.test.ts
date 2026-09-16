import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, rm, access, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error Standalone Node development tool has no declaration file.
import { prepareCandidate, parseArgs } from "../tools/prepare-release-candidate.mjs";

const names = ["contracts", "core", "adapters", "privacy", "measurement", "evidence", "discovery", "handoff", "journey", "cli"];
const run = (cwd: string, command: string, args: string[]) => execFileSync(command, args, {
  cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
}).trim();
const git = (cwd: string, ...args: string[]) => run(cwd, "git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Synthetic", "-c", "user.email=fixture@example.invalid", ...args]);
async function fixture(t: { after(fn: () => void | Promise<void>): void }) {
  const base = await mkdtemp(join(tmpdir(), "candidate-fixture-"));
  const priorCache = process.env.npm_config_cache;
  process.env.npm_config_cache = join(base, "npm-cache");
  t.after(() => { if (priorCache === undefined) delete process.env.npm_config_cache; else process.env.npm_config_cache = priorCache; });
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, "source");
  await mkdir(join(root, "tools"), { recursive: true });
  await mkdir(join(root, "skills/better-loop"), { recursive: true });
  await writeFile(join(root, "skills/better-loop/SKILL.md"), "# Public synthetic skill fixture\n");
  await writeFile(join(root, ".gitignore"), "node_modules/\nartifacts/\n");
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "synthetic-source", private: true, workspaces: ["packages/*"], scripts: {
    check: "node -e \"if(require('fs').existsSync('artifacts/stale'))process.exit(1)\"",
    "test:consumer": "node -e \"process.exit(0)\"",
  } }));
  for (const name of names) {
    const dir = join(root, "packages", name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: `@better-loop/${name}`, version: "1.2.3-draft.9", main: "index.cjs", files: ["index.cjs"] }));
    await writeFile(join(dir, "index.cjs"), "module.exports = { synthetic: true };\n");
  }
  await writeFile(join(root, "tools/pack-local.mjs"), await readFile(new URL("../tools/pack-local.mjs", import.meta.url)));
  run(root, "npm", ["install", "--package-lock-only", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"]);
  git(root, "init", "--quiet", "--initial-branch=main", "--template=");
  git(root, "add", "."); git(root, "commit", "--quiet", "-m", "Public synthetic fixture");
  return { root, base, output: join(base, "candidate"), label: "review-1" };
}

test("rejects every source dirtiness class before creating output", async t => {
  const f = await fixture(t);
  const path = join(f.root, "skills/better-loop/SKILL.md");
  for (const kind of ["unstaged", "staged", "deleted", "untracked"]) {
    if (kind === "untracked") await writeFile(join(f.root, "new-source.txt"), "synthetic\n");
    else if (kind === "deleted") await rm(path);
    else await writeFile(path, "changed synthetic source\n");
    if (kind === "staged") git(f.root, "add", ".");
    await assert.rejects(prepareCandidate({ ...f, repository: f.root }), /dirty_source/);
    await assert.rejects(access(f.output));
    git(f.root, "reset", "--hard", "HEAD");
    if (kind === "untracked") await rm(join(f.root, "new-source.txt"));
  }
});

test("rejects index flags that could conceal tracked source changes", async t => {
  const f = await fixture(t);
  const path = "skills/better-loop/SKILL.md";
  for (const flag of ["assume-unchanged", "skip-worktree"]) {
    git(f.root, "update-index", `--${flag}`, path);
    await assert.rejects(prepareCandidate({ ...f, repository: f.root }), /hidden_index_flags/);
    git(f.root, "update-index", `--no-${flag}`, path);
  }
});

test("rejects a pack receipt whose hash does not match its actual archive", async t => {
  const f = await fixture(t);
  const path = join(f.root, "tools/pack-local.mjs");
  await writeFile(path, (await readFile(path, "utf8")) + `\nconst receipt = JSON.parse(await readFile("artifacts/local-release.json", "utf8"));\nreceipt.packages[0].sha256 = "0".repeat(64);\nawait writeFile("artifacts/local-release.json", JSON.stringify(receipt));\n`);
  git(f.root, "add", "."); git(f.root, "commit", "--quiet", "-m", "Synthetic corrupt receipt");
  await assert.rejects(prepareCandidate({ ...f, repository: f.root }), /archive_receipt_or_source_metadata_mismatch/);
  await assert.rejects(access(join(f.output, "candidate.json")));
});

test("exact committed source, draft version and all ten archive hashes survive preparation", async t => {
  const f = await fixture(t);
  await mkdir(join(f.root, "artifacts"));
  await writeFile(join(f.root, "artifacts/stale"), "must not enter source build");
  const sha = git(f.root, "rev-parse", "HEAD");
  const receipt = await prepareCandidate({ ...f, repository: f.root });
  assert.equal(receipt.source_sha, sha);
  assert.equal(receipt.source_cli_version, "1.2.3-draft.9");
  assert.equal(receipt.candidate_label, "review-1");
  assert.equal(receipt.tag, null); assert.equal(receipt.signature, null);
  assert.equal(receipt.publication, "none");
  assert.equal(receipt.packages.length, 10);
  assert.ok(receipt.checks.includes("exact_ten_archives_offline_install_ci_esm_cjs"));
  for (const archive of receipt.archives) {
    const bytes = await readFile(join(f.output, archive.filename));
    assert.equal(archive.sha256, createHash("sha256").update(bytes).digest("hex"));
  }
  const unpacked = join(f.base, "unpacked"); await mkdir(unpacked);
  run(f.base, "tar", ["-xzf", join(f.output, "source.tar.gz"), "-C", unpacked]);
  assert.equal(await readFile(join(unpacked, "skills/better-loop/SKILL.md"), "utf8"), git(f.root, "show", `${sha}:skills/better-loop/SKILL.md`) + "\n");
  await assert.rejects(access(join(unpacked, "artifacts/stale")));
  const skill = run(f.base, "tar", ["-xOf", join(f.output, "skill.tar.gz"), "skills/better-loop/SKILL.md"]);
  assert.equal(skill, git(f.root, "show", `${sha}:skills/better-loop/SKILL.md`));
  for (const pkg of receipt.packages) {
    const bytes = await readFile(join(f.output, pkg.filename));
    assert.equal(pkg.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(pkg.integrity, `sha512-${createHash("sha512").update(bytes).digest("base64")}`);
    assert.equal(pkg.version, "1.2.3-draft.9");
  }
  assert.deepEqual(JSON.parse(await readFile(join(f.output, "candidate.json"), "utf8")), receipt);
  const local = JSON.parse(await readFile(join(f.output, "local-release.json"), "utf8"));
  assert.deepEqual(local.packages, receipt.packages);
  assert.equal(git(f.root, "status", "--porcelain"), "");
});

test("rejects output reuse, output inside source and invalid invocation", async t => {
  const f = await fixture(t);
  for (const args of [["--tag", "v1"], ["--output"], ["--label", "a", "--label", "b"], ["--publish", "yes"]]) assert.throws(() => parseArgs(args), /usage/);
  await assert.rejects(prepareCandidate({ ...f, repository: f.root, label: "../../tag" }), /candidate_label_required/);
  await assert.rejects(prepareCandidate({ repository: f.root, label: "review" }), /new_output_directory_required/);
  await assert.rejects(prepareCandidate({ ...f, repository: f.root, output: join(f.root, "artifacts") }), /output_must_be_outside/);
  await mkdir(f.output);
  await writeFile(join(f.output, "retain"), "retain");
  await assert.rejects(prepareCandidate({ ...f, repository: f.root }), /EEXIST/);
  assert.equal(await readFile(join(f.output, "retain"), "utf8"), "retain");
  const alias = join(f.base, "alias"); await symlink(f.output, alias);
  await assert.rejects(prepareCandidate({ ...f, repository: f.root, output: alias }), /EEXIST/);
});

test("failed source check leaves no successful receipt", async t => {
  const f = await fixture(t);
  const pkgPath = join(f.root, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  pkg.scripts.check = "node -e \"process.exit(17)\"";
  await writeFile(pkgPath, JSON.stringify(pkg));
  git(f.root, "add", "."); git(f.root, "commit", "--quiet", "-m", "Failing synthetic source check");
  await assert.rejects(prepareCandidate({ ...f, repository: f.root }));
  await assert.rejects(access(join(f.output, "candidate.json")));
  await access(join(f.output, "source.tar.gz"));
});
