import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

/** Explicit synthetic/authorized input only. No tools, hooks, skills, history or session persistence. */
export async function runClaude(prompt, { system, timeoutMs = 120_000, maxCostUsd = 0.50 } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "better-loop-synthetic-host-"));
  const args = [
    "--safe-mode", "--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
    "--setting-sources", "", "--no-session-persistence", "--max-budget-usd", String(maxCostUsd),
    "--output-format", "json", "-p",
  ];
  if (system) args.push("--system-prompt", system);
  const start = performance.now();
  const result = await new Promise(resolve => {
    const child = spawn("claude", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false, limited = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
      if (stdout.length > 2_000_000) { limited = true; child.kill("SIGTERM"); }
    });
    child.stderr.on("data", chunk => { if (stderr.length < 16_384) stderr += chunk.toString(); });
    child.on("error", () => { clearTimeout(timer); resolve({ exit: null, stdout: "", stderr: "", unavailable: true }); });
    child.on("close", exit => { clearTimeout(timer); resolve({ exit, stdout, stderr, timedOut, limited }); });
    child.stdin.end(prompt);
  });
  let response;
  try { response = JSON.parse(result.stdout); } catch { response = null; }
  // Host diagnostics remain private; do not include them in public evaluation records.
  await writeFile(join(cwd, "diagnostic.txt"), result.stderr, { mode: 0o600 });
  return {
    exit: result.exit,
    timed_out: result.timedOut === true,
    output_limited: result.limited === true,
    duration_ms: Math.round(performance.now() - start),
    success: result.exit === 0 && response?.is_error === false,
    output: response?.result ?? null,
    usage: response?.usage ?? null,
    model_usage: response?.modelUsage ?? null,
    estimated_api_cost_usd: response?.total_cost_usd ?? null,
    cost_basis: "host_reported_list_estimate_not_cash_billing",
  };
}
