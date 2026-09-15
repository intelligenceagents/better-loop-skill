import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  accountTelemetry, freezeProtocol, measureEvaluation, planFromRecord, repeatedImprovement,
} from "../../packages/measurement/dist/index.js";
const hash = text => createHash("sha256").update(text).digest("hex");
const frozenText = await readFile(new URL("./benchmark-registration.json", import.meta.url), "utf8");
const frozen = JSON.parse(frozenText);
const raw = JSON.parse(await readFile(new URL("./results/benchmark-raw.json", import.meta.url), "utf8"));
if (hash(frozenText) !== raw.registration_sha256) throw new Error("registration_changed");
if (raw.records.some(record => record.success && record.model_condition_matches !== true))
  throw new Error("executed_model_differs_from_frozen_condition");
const results = [];
function ledger(record) {
  const models = Object.entries(record.model_usage ?? {});
  return {
    coverage: { parent: models.some(([id]) => id === frozen.expected_model) ? "complete" : "missing",
      worker: "not_applicable", judge: "not_applicable", retry: "not_applicable",
      orchestration: models.some(([id]) => id !== frozen.expected_model) ? "complete" : "not_applicable" },
    entries: models.map(([id, usage], index) => ({
      id: `${record.task_id}-${record.pair_id}-${record.arm}-model-${index}`,
      role: id === frozen.expected_model ? "parent" : "orchestration",
      input_token_semantics: "excludes_cache",
      input_tokens: usage.inputTokens ?? null, output_tokens: usage.outputTokens ?? null,
      cache_read_tokens: usage.cacheReadInputTokens ?? null, cache_write_tokens: usage.cacheCreationInputTokens ?? null,
      model_duration_seconds: null, human_effort_seconds: null, actual_billing_usd: null,
      estimated_api_cost_usd: usage.costUSD ?? null,
    })),
  };
}
for (const task of frozen.tasks) {
  const conditions = { platform: "claude_code", model_version: frozen.expected_model, effort: frozen.effort, tool_access: [] };
  const draft = {
    schema_version: "0.1.0", framework_version: "better-loop-fluency-0.1", content_origin: "public_benchmark",
    run_id: `real-host-pilot-${task.id}-v1`, task_instance_id: `public-synthetic-${task.id}-v1`,
    task: { task_family: "analysis_finance", problem_type: "reconciling_data", objective: "lower_resource_use",
      difficulty: "routine", difficulty_basis: "self_estimated", constraints: ["fixed_inputs", "format_required", "quality_threshold", "tool_limited"],
      demonstrated_skills: [], task_contract_version: "bl-task-0.1", benchmark_contract: "synthetic-reconciliation-0.1" },
    protocol: {
      kind: "controlled_paired", primary_metric: "model_tokens", direction: "lower_is_better",
      quality_floor_definition: "All six prespecified exact-JSON and fixed-ledger checks pass unchanged.",
      evaluator_version: "bl-ledger-exact-json-0.1", metric_definition_version: "bl-metrics-0.1",
      frozen_before_execution: true, planned_pair_ids: ["pair-1", "pair-2", "pair-3"],
      intervention: "Use the actual Better Loop rewritePrompt process-check additions, frozen before execution.",
      compatibility: "comparable", resource_budget: { max_total_tokens: null, max_duration_seconds: frozen.budgets.total_wall_seconds },
      overhead_accounting: "All reported per-model token categories and list-cost estimates retained, including auxiliary host models. Model time, human effort, cash billing and shared preparation overhead unavailable. No task retries, model judges or workers requested.",
    },
    conditions: { baseline: { ...conditions, skill_version: "none" }, candidate: { ...conditions, skill_version: `bl-prompt-rewrite-0.2-${frozen.engine_source_hash.slice(0, 12)}` } },
    observations: [], trials: [],
  };
  const quality = {}, telemetry = {};
  for (let i = 0; i < frozen.pairs_per_task; i++) {
    const pairId = `pair-${i + 1}`;
    const pair = { pair_id: pairId, order: frozen.order[i], seed: null };
    quality[pairId] = {};
    telemetry[pairId] = {};
    for (const arm of ["baseline", "candidate"]) {
      const record = raw.records.find(r => r.task_id === task.id && r.pair_id === pairId && r.arm === arm);
      if (!record) throw new Error("omitted_trial_in_raw_record");
      const accounted = ledger(record);
      const totals = accountTelemetry(accounted);
      telemetry[pairId][arm] = accounted;
      quality[pairId][arm] = { exact_json: record.success ? Number(record.grading.passed) : null };
      const baseline = raw.records.find(r => r.task_id === task.id && r.pair_id === pairId && r.arm === "baseline");
      pair[arm] = {
        status: record.success ? "completed" : "failed",
        metrics: {
          model_tokens: totals.model_tokens.total, model_duration: null, human_effort: null,
          estimated_api_cost: totals.estimated_api_cost_usd.total, rework_cycles: null,
          quality_rubric: record.success ? Number(record.grading.passed) : null,
        },
        quality_floor_passed: record.success ? record.grading.passed : null,
        critical_regression: record.success ? arm === "candidate" && baseline.grading.passed && !record.grading.passed : null,
        started_at: record.started_at, finished_at: record.finished_at,
        failure_or_omission_reason: record.success ? null : "host_execution_failed_or_budget_exhausted",
      };
    }
    draft.trials.push(pair);
  }
  const baseContext = {
    task: draft.task, input_version: `${task.id}-v1`, equivalence_group: `${task.id}-same-fixed-input`,
    acceptance_criteria_version: "bl-ledger-exact-json-0.1", evaluator_version: draft.protocol.evaluator_version,
    metric_definition_version: "bl-metrics-0.1", metric_unit: "count",
    resource_conditions: "Same isolated CLI invocation, fixed synthetic input, no tools, host-default effort, identical timeout/cost caps.",
  };
  // This typed envelope is derived after execution from the committed pre-run registration.
  // registered_at belongs to that original registration; derived_at below records conversion honestly.
  const registration = freezeProtocol(planFromRecord(draft), {
    registered_at: frozen.registered_at,
    baseline: { ...baseContext, conditions: draft.conditions.baseline },
    candidate: { ...baseContext, conditions: draft.conditions.candidate },
    allowed_condition_changes: ["skill_version"],
    quality_rule: { version: "bl-ledger-exact-json-0.1", dimensions: [{ id: "exact_json", minimum: 0, maximum: 1, floor: 1, max_regression: 0 }] },
    task_fingerprint: hash(JSON.stringify(task.rows)), independent_pairs: false,
    trial_plan: draft.protocol.planned_pair_ids.map((pair_id, i) => ({
      pair_id, order: frozen.order[i], seed: null, blind_assignment: i % 2 ? "baseline_as_A" : "candidate_as_A",
    })),
  });
  const options = {
    registration, quality, telemetry,
    shared_telemetry: { coverage: { parent: "missing", worker: "not_applicable", judge: "not_applicable", retry: "not_applicable", orchestration: "missing" }, entries: [] },
  };
  const measured = measureEvaluation(draft, options);
  results.push({ task_id: task.id, source_registration_commit: "a751b58", source_registration_sha256: hash(frozenText),
    derived_at: new Date().toISOString(), registration, options, result: measured });
  console.log(JSON.stringify(measured.valid ? { task: task.id, outcome: measured.report.outcome, counts: measured.report.counts, mean: measured.report.mean_relative_change_percent, eligibility: measured.report.eligibility } : measured));
}
await writeFile(new URL("./results/benchmark-analysis.json", import.meta.url), JSON.stringify({
  interpretation: "Genuinely executed synthetic tasks. Typed registration envelopes were converted from pre-run commit a751b58 without modifying the prompts, inputs, rubric, order, metric or limits. Blinded deterministic grading does not need model judge calls. Shared preparation overhead is unknown and no resource-improvement benefit is awarded.",
  results,
  repeated_milestone: repeatedImprovement(results.filter(r => r.result.valid).map(r => ({ record: r.result.record, options: r.options }))),
}, null, 2) + "\n");
if (results.some(r => !r.result.valid)) process.exitCode = 1;
