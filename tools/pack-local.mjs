import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

await mkdir("artifacts", { recursive: true });
const packages = [];
const temporary = await mkdtemp(join(tmpdir(), "better-loop-pack-"));
try {
  for (const name of ["contracts", "core", "adapters", "privacy", "measurement", "cli"]) {
    const [packed] = JSON.parse(execFileSync("npm", [
      "pack", "--workspace", `@better-loop/${name}`, "--pack-destination", temporary, "--json",
    ], { encoding: "utf8" }));
    const fresh = await readFile(join(temporary, packed.filename));
    const destination = join("artifacts", packed.filename);
    let existing;
    try { existing = await readFile(destination); } catch (error) { if (error.code !== "ENOENT") throw error; }
    // Preserve the exact reviewed privacy archive when only compression differs.
    if (name === "privacy" && existing) {
      if (!gunzipSync(existing).equals(gunzipSync(fresh))) throw new Error("reviewed_privacy_archive_source_mismatch");
    } else await copyFile(join(temporary, packed.filename), destination);
    const bytes = await readFile(destination);
    packages.push({
      name: packed.name, version: packed.version, filename: packed.filename,
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
await writeFile("artifacts/local-release.json", JSON.stringify({
  format: "bl-local-package-set-0.1", packages, publication: "local_archives_only",
}, null, 2) + "\n");
console.log(JSON.stringify({ state: "local_archives_ready", manifest: "artifacts/local-release.json", packages: packages.length, registry_publication: false }));
