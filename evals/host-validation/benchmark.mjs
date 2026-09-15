import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { runClaude } from "./claude-host.mjs";
import { parseJson, canonicalize } from "../../packages/contracts/dist/index.js";

const hash = input => createHash("sha256").update(input).digest("hex");
const registrationPath = new URL("./benchmark-registration.json", import.meta.url);
const system = "Complete the synthetic task using only the supplied data. Tools are unavailable. Honor the user's requested output format exactly.";
if (process.argv.includes("--freeze")) {
  const { rewritePrompt } = await import("../../packages/core/src/prompt.ts");
  const datasets = [
    {
      id: "ledger-a", rows: [
        { id: "a", debit: 125, credit: 0 }, { id: "b", debit: 0, credit: 45 },
        { id: "c", debit: 20, credit: 0 }, { id: "b", debit: 0, credit: 45 }, { id: "d", debit: 0, credit: 15 },
      ],
      expected: { unique_rows: 4, duplicate_ids: ["b"], total_debits: 145, total_credits: 60, net: 85 },
    },
    {
      id: "ledger-b", rows: [
        { id: "x", debit: 340, credit: 0 }, { id: "y", debit: 0, credit: 125 },
        { id: "z", debit: 0, credit: 75 }, { id: "x", debit: 340, credit: 0 },
        { id: "q", debit: 60, credit: 0 }, { id: "r", debit: 0, credit: 0 },
      ],
      expected: { unique_rows: 5, duplicate_ids: ["x"], total_debits: 400, total_credits: 200, net: 200 },
    },
  ];
  const tasks = datasets.map(task => {
    const original = `Reconcile this synthetic ledger. Amounts are integer units. Deduplicate identical rows by id, count zero-value rows, and sum each unique row once. Net means total debits minus total credits. Return ONLY one JSON object with exactly these keys: unique_rows (integer), duplicate_ids (sorted array of repeated ids, once each), total_debits (integer), total_credits (integer), net (integer). Do not add commentary, Markdown or fields. Inputs are fixed; do not change values or apply other assumptions.\n${JSON.stringify(task.rows)}`;
    return { ...task, baseline_prompt: original, candidate_prompt: rewritePrompt(original, "analysis_finance").rewritten };
  });
  const registration = {
    version: "bl-real-host-pilot-0.1", registered_at: new Date().toISOString(),
    data: "authored synthetic tasks; measurements will be real host telemetry, not invented fixture values",
    engine_source_hash: hash(await readFile(new URL("../../packages/core/src/prompt.ts", import.meta.url))),
    domain_check_source_hash: hash(await readFile(new URL("../../packages/core/src/assessment.ts", import.meta.url))),
    reference: {
      repository: "anthropics/skills", commit: "34040c9c568585f6929bedeaad110ad08f079624",
      files: ["skills/skill-creator/agents/comparator.md", "skills/skill-creator/scripts/aggregate_benchmark.py"],
      license: "Apache-2.0", reuse: "Experimental structure only; no upstream source copied.",
      adaptations: "Rubric frozen before outputs; deterministic blinded grading permits ties; absent telemetry stays null; no character-count fallback.",
    },
    runtime: "Claude Code 2.1.269", expected_model: "claude-opus-5[1m]", effort: "host default, not inferred",
    system_prompt: system, pairs_per_task: 3,
    order: ["baseline_first", "candidate_first", "baseline_first"],
    quality: { checks: ["strict_json_exact_keys", "unique_rows", "duplicate_ids", "total_debits", "total_credits", "net"], floor: 6, maximum: 6 },
    primary_metric: "all_reported_model_tokens", primary_direction: "lower_is_better",
    budgets: { invocations: 12, per_call_timeout_seconds: 120, per_call_cost_cap_usd: 0.5, total_wall_seconds: 900 },
    accounting: "Sum per-model reported input, output, cache-read and cache-write tokens; preserve auxiliary model overhead. Host cost is a list-price estimate, not cash billing. Elapsed CLI time is not model time. No workers, model judges or task retries are requested. Host-internal missing duration remains null.",
    inference: "Small controlled pilot; pairs within each task are not independent task instances. No population CI, fluency calibration, repeated-improvement milestone or general efficiency claim.",
    tasks,
  };
  await writeFile(registrationPath, JSON.stringify(registration, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ frozen: true, tasks: tasks.length, invocations: 12, sha256: hash(JSON.stringify(registration)) }));
} else {
  const registrationText = await readFile(registrationPath, "utf8");
  const registration = JSON.parse(registrationText);
  await mkdir(new URL("./results/", import.meta.url), { recursive: true });
  const resultPath = new URL("./results/benchmark-raw.json", import.meta.url);
  // Existing outcomes are never overwritten or silently rerun.
  await writeFile(resultPath, JSON.stringify({ state: "running", records: [] }, null, 2), { flag: "wx" });
  const records = [];
  const started = Date.now();
  function grade(output, expected) {
    let parsed;
    try { parsed = parseJson(output); } catch { parsed = null; }
    const keys = Object.keys(expected);
    const shape = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) &&
      Object.keys(parsed).sort().join(",") === keys.sort().join(",");
    const checks = { strict_json_exact_keys: shape };
    for (const key of keys) checks[key] = shape && canonicalize(parsed[key]) === canonicalize(expected[key]);
    return { checks, score: Object.values(checks).filter(Boolean).length, passed: Object.values(checks).every(Boolean) };
  }
  const persist = async () => writeFile(resultPath, JSON.stringify({
    registration_sha256: hash(registrationText), records,
    all_outcomes_retained: true, task_failures_not_retried: true,
  }, null, 2) + "\n");
  for (const task of registration.tasks) {
    for (let pair = 0; pair < registration.pairs_per_task; pair++) {
      const order = registration.order[pair];
      for (const arm of order === "baseline_first" ? ["baseline", "candidate"] : ["candidate", "baseline"]) {
        const begin = new Date().toISOString();
        const response = Date.now() - started < registration.budgets.total_wall_seconds * 1000
          ? await runClaude(task[`${arm}_prompt`], { system: registration.system_prompt })
          : { success: false, output: null, omitted: "batch_wall_budget_exhausted", usage: null, model_usage: null };
        // The grader receives output and expected answers, never the arm label.
        const grading = grade(response.output, task.expected);
        const models = Object.entries(response.model_usage ?? {});
        let totalTokens = null;
        if (models.length && models.every(([, values]) => ["inputTokens", "outputTokens", "cacheReadInputTokens", "cacheCreationInputTokens"].every(key => Number.isFinite(values[key]) && values[key] >= 0))) {
          totalTokens = models.reduce((sum, [, values]) => sum + values.inputTokens + values.outputTokens + values.cacheReadInputTokens + values.cacheCreationInputTokens, 0);
        }
        records.push({ task_id: task.id, pair_id: `pair-${pair + 1}`, order, arm,
          started_at: begin, finished_at: new Date().toISOString(), ...response, grading, total_reported_model_tokens: totalTokens,
          model_condition_matches: models.some(([name]) => name === registration.expected_model) });
        await persist();
        console.log(JSON.stringify({ task: task.id, pair: pair + 1, arm, completed: response.success, score: grading.score, tokens: totalTokens }));
      }
    }
  }
}
