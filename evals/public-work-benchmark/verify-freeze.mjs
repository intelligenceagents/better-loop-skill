import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("./", import.meta.url);
const freeze = JSON.parse(readFileSync(new URL("freeze.json", root), "utf8"));
if (freeze.version !== "bl-public-work-freeze-0.1" || freeze.outputs_at_freeze !== 0) {
  throw new Error("invalid_benchmark_freeze");
}
for (const entry of freeze.files) {
  if (!/^[a-zA-Z0-9_.\/-]+$/.test(entry.path) || entry.path.includes("..") || entry.path.startsWith("/")) {
    throw new Error("invalid_freeze_path");
  }
  const actual = createHash("sha256").update(readFileSync(new URL(entry.path, root))).digest("hex");
  if (actual !== entry.sha256) throw new Error(`benchmark_freeze_changed: ${entry.path}`);
}
console.log(`Frozen public benchmark verified: ${freeze.files.length} files; no model execution.`);
