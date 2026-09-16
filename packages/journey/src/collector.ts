import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { directory, fail, hash, noLinks, readBounded } from "./safety.js";
import { JourneyError, LIMITS } from "./types.js";
import type { RepositorySnapshot, SelectedRoot } from "./types.js";

const GIT_OPTIONS = [
  "--no-pager", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false",
  "-c", "core.untrackedCache=false", "-c", "core.preloadIndex=false",
  "-c", "diff.external=", "-c", "core.attributesFile=/dev/null",
];
/** No caller-supplied executable, shell fragments, Git config, aliases, filters, or author queries. */
async function git(root: string, args: string[], allowedCodes: number[] = [0]): Promise<{ stdout: string; code: number }> {
  return new Promise((accept, reject) => {
    execFile("git", [...GIT_OPTIONS, "-C", root, ...args], {
      encoding: "buffer", timeout: LIMITS.gitTimeoutMs, maxBuffer: LIMITS.gitBytes,
      windowsHide: true, shell: false,
      env: {
        PATH: process.env.PATH, LANG: "C", LC_ALL: "C",
        GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null",
        GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_LITERAL_PATHSPECS: "1",
      },
    }, (error, stdout) => {
      const code = !error ? 0 : typeof error.code === "number" ? error.code : -1;
      if (!allowedCodes.includes(code) || error?.killed) { reject(new JourneyError("bounded_git_read_failed")); return; }
      try { accept({ stdout: new TextDecoder("utf-8", { fatal: true }).decode(stdout), code }); }
      catch { reject(new JourneyError("invalid_git_path_encoding")); }
    });
  });
}
export async function selectRoots(roots: string[]): Promise<SelectedRoot[]> {
  if (!Array.isArray(roots) || !roots.length || roots.length > LIMITS.repositories) fail("invalid_scope");
  const selected: SelectedRoot[] = [];
  for (const input of roots) {
    const root = await directory(input);
    const top = (await git(root.path, ["rev-parse", "--show-toplevel"])).stdout.trim();
    const bare = (await git(root.path, ["rev-parse", "--is-bare-repository"])).stdout.trim();
    if (top !== root.path || bare !== "false") fail("select_exact_worktree_root");
    if (selected.some(other => other.path === root.path || root.path.startsWith(other.path + sep) || other.path.startsWith(root.path + sep))) fail("overlapping_roots");
    selected.push(root);
  }
  return selected.sort((a, b) => a.path.localeCompare(b.path, "en"));
}
async function header(root: string) {
  const head = await git(root, ["rev-parse", "--verify", "HEAD"], [0, 128]);
  const oid = head.code === 0 ? head.stdout.trim() : null;
  if (oid !== null && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid)) fail("invalid_repository_head");
  // Never use git status/diff here: refreshing worktree content can invoke a
  // repository-configured clean/process filter. Status comes from our bounded
  // indexed-file availability/content comparison, not Git content conversion.
  const index = (await git(root, ["ls-files", "--stage", "-z"])).stdout;
  return { head: oid, index };
}
export async function descendsFrom(root: string, before: string, after: string): Promise<boolean> {
  if (![before, after].every(value => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value))) fail("corrupt_state");
  const outcome = await git(root, ["merge-base", "--is-ancestor", before, after], [0, 1, 128]);
  return outcome.code === 0;
}
export function excludedPath(path: string): string | null {
  if (!path || path.startsWith("/") || path.split("/").some(part => !part || part === "." || part === "..") ||
      /[\\\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(path)) return "unsafe_path";
  const pieces = path.toLowerCase().split("/");
  if (pieces.some(part => /^(?:\.git|\.better-loop|\.claude|\.codex|node_modules|dist|build|out|coverage|artifacts|\.next|\.venv|venv|vendor|target|__pycache__|generated|private-evidence|private-artifacts|private-artifact|local-reports|raw-artifacts|transcripts|screenshots|exports|\.cache)$/.test(part))) return "excluded_directory";
  if (pieces.some(part => /(?:^\.env(?:\.|$)|credentials?|secrets?|(?:^|[-_.])(?:private[-_]?key|api[-_]?key|access[-_]?token|keystore|keychain)(?:[-_.]|$))/.test(part)) ||
      /\.(?:pem|key|p12|pfx|jks|der|crt|db|sqlite3?|log|tgz|zip|map|lock)$/i.test(path) ||
      /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|id_rsa|id_ed25519|known_hosts|authorized_keys)$/i.test(path)) return "credential_or_private_artifact_name";
  if (!/(?:\.(?:[cm]?[jt]sx?|md|mdx|txt|json|ya?ml|toml|xml|html?|css|scss|less|py|rs|go|java|c|h|cpp|hpp|cs|rb|php|swift|kt|sql|sh|bash|zsh|svelte|vue|graphql|gql|r|rmd|tex)|(?:^|\/)(?:Dockerfile|Makefile|LICENSE|NOTICE|\.gitignore|\.gitattributes))$/i.test(path)) return "unsupported_text_type";
  return null;
}
function excludedContent(text: string): string | null {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001a\u001c-\u001f]/u.test(text) || text.includes("\u001b")) return "binary_or_control_text";
  if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|(?:^|\n)\s*(?:export\s+)?(?:[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY)[A-Z0-9_]*)\s*=\s*["']?[^\s"'#]{8}|(?:postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^:\s/]+:[^@\s]+@/m.test(text)) return "credential_shaped_content";
  return null;
}
export async function collectRepositories(roots: SelectedRoot[], stateDirectory: string): Promise<RepositorySnapshot[]> {
  let remaining = LIMITS.totalTextBytes;
  const snapshots: RepositorySnapshot[] = [];
  for (const selected of roots) {
    const root = await directory(selected.path);
    if (root.identity !== selected.identity) fail("scope_root_identity_changed");
    const before = await header(root.path);
    const entries = before.index.split("\0").filter(Boolean);
    if (entries.length > LIMITS.filesPerRepository) fail("tracked_file_limit_exceeded");
    const snapshot: RepositorySnapshot = { root: root.path, identity: root.identity, head: before.head, files: [], unavailable: [], excluded: {} };
    const seen = new Set<string>();
    const stamps: { path: string; size: number; mtime: number; ctime: number; inode: number }[] = [];
    const exclude = (reason: string) => { snapshot.excluded[reason] = (snapshot.excluded[reason] ?? 0) + 1; };
    for (const entry of entries) {
      const match = /^(100644|100755|120000|160000) ([a-f0-9]+) ([0-3])\t(.+)$/u.exec(entry);
      if (!match) fail("unsupported_index_entry");
      const [, mode, , stage, path] = match as unknown as [string, string, string, string, string];
      if (stage !== "0") fail("unmerged_index");
      if (seen.has(path)) fail("duplicate_index_path");
      seen.add(path);
      const reason = excludedPath(path);
      if (reason) { exclude(reason); continue; }
      const target = join(root.path, path);
      if (target === stateDirectory || target.startsWith(stateDirectory + sep)) { exclude("selected_state_directory"); continue; }
      if (mode !== "100644" && mode !== "100755") { exclude("symlink_or_submodule"); snapshot.unavailable.push(path); continue; }
      const contained = relative(root.path, target);
      if (!contained || contained.startsWith(".." + sep)) fail("outside_selected_root");
      try {
        await noLinks(target);
        const stat = await lstat(target);
        if (!stat.isFile() || stat.nlink !== 1 || stat.size > LIMITS.fileBytes) {
          exclude(stat.size > LIMITS.fileBytes ? "oversized" : "non_regular_or_linked"); snapshot.unavailable.push(path); continue;
        }
        const text = await readBounded(target, LIMITS.fileBytes);
        const contentReason = excludedContent(text);
        if (contentReason) { exclude(contentReason); snapshot.unavailable.push(path); continue; }
        const bytes = Buffer.byteLength(text);
        if (bytes > remaining) fail("total_text_limit_exceeded");
        remaining -= bytes;
        snapshot.files.push({ path, hash: hash(text), text });
        stamps.push({ path: target, size: stat.size, mtime: stat.mtimeMs, ctime: stat.ctimeMs, inode: stat.ino });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") { exclude("tracked_file_absent"); continue; }
        if (error instanceof JourneyError && ["symlink_not_allowed", "ineligible_file", "binary_or_invalid_utf8"].includes(error.code)) {
          exclude(error.code); snapshot.unavailable.push(path); continue;
        }
        throw error;
      }
    }
    for (const stamp of stamps) {
      const stat = await lstat(stamp.path);
      if (stat.isSymbolicLink() || stat.ino !== stamp.inode || stat.size !== stamp.size || stat.mtimeMs !== stamp.mtime || stat.ctimeMs !== stamp.ctime) fail("source_changed_retry");
    }
    const after = await header(root.path);
    if (JSON.stringify(before) !== JSON.stringify(after) || (await directory(root.path)).identity !== selected.identity) fail("source_changed_retry");
    snapshot.files.sort((a, b) => a.path.localeCompare(b.path, "en"));
    snapshots.push(snapshot);
  }
  return snapshots;
}
