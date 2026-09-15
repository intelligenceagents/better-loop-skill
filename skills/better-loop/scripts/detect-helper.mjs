#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isAbsolute } from "node:path";

// Only a known repository-relative helper or the operator's explicit absolute entrypoint.
// No registry install, skill invocation, filesystem crawl, model call, or fallback uploader.
const entrypoint = process.argv[2] ?? fileURLToPath(new URL("../../../packages/cli/dist/cli.js", import.meta.url));
let result = { state: "unavailable", protocol: "bl-capabilities-0.2", capabilities: null };
try {
  if (!isAbsolute(entrypoint) || process.argv.length > 3) throw new Error("explicit_absolute_entrypoint_required");
  const parsed = JSON.parse(execFileSync(process.execPath, [entrypoint, "capabilities", "--json"], {
    encoding: "utf8", timeout: 5000, maxBuffer: 16384, stdio: ["ignore", "pipe", "pipe"], shell: false,
  }));
  if (parsed.protocol !== "bl-capabilities-0.2" || parsed.helper_version !== "0.4.0-draft.1" ||
      parsed.packages?.contracts !== "0.1.0-draft.1" || parsed.packages?.privacy !== "0.1.0-draft.3" ||
      parsed.packages?.journey !== "0.2.0-draft.1" || parsed.packages?.evidence !== "0.1.0-draft.2" ||
      parsed.packages?.discovery !== "0.1.0-draft.2" || parsed.packages?.handoff !== "0.1.0-draft.2" ||
      parsed.capabilities?.explicit_repository_journey !== true || parsed.capabilities?.persisted_host_assessment !== true ||
      parsed.capabilities?.selected_assessment !== true || parsed.capabilities?.descriptive_indicators !== 11 ||
      parsed.capabilities?.upload !== false || parsed.capabilities?.calibrated_ranking !== false) {
    result.state = "incompatible";
  } else result = { state: "available", protocol: parsed.protocol, capabilities: parsed };
} catch { /* Safe capability absence; never disclose local paths or provider errors. */ }
console.log(JSON.stringify(result));
process.exitCode = result.state === "available" ? 0 : 1;
