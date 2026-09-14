import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSelectedExport, parseTaskContext, INPUT_LIMIT_BYTES } from "../packages/adapters/src/index.js";
import type { TaskContext } from "../packages/core/src/index.js";

const task: TaskContext = { family: "general", goal: "Review one synthetic selected task.", acceptance_criteria: [] };
const jsonl = (events: unknown[]) => events.map(event => JSON.stringify(event)).join("\n");
test("both native adapters preserve equivalent human, agent and tool semantic records", () => {
  const claude = normalizeSelectedExport(jsonl([
    { type: "user", message: { role: "user", content: [{ type: "text", text: "Goal: reconcile the total." }] } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "I will check the original source." }] } },
    { type: "user", message: { role: "user", content: [{ type: "tool_result", content: "Synthetic check complete." }] } },
  ]), "claude_code", { task });
  const codex = normalizeSelectedExport(jsonl([
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Goal: reconcile the total." }] } },
    { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "I will check the original source." }] } },
    { type: "response_item", payload: { type: "function_call_output", output: "Synthetic check complete." } },
  ]), "codex", { task });
  assert.deepEqual(claude.records, codex.records);
  assert.deepEqual(claude.task, codex.task);
  assert.deepEqual(claude.metrics, codex.metrics);
  assert.equal(claude.coverage, codex.coverage);
  assert.deepEqual(claude.records.map(item => item.actor), ["human", "agent", "tool"]);
});
test("Claude meta/replay/subagent messages are not silently attributed to a person", () => {
  const records = normalizeSelectedExport(jsonl([
    { type: "user", isMeta: true, message: { content: "Goal: automated context." } },
    { type: "user", isSynthetic: true, message: { content: "Goal: synthetic context." } },
    { type: "user", parent_tool_use_id: "synthetic-worker", message: { content: "Goal: delegated work." } },
    { type: "user", message: { role: "assistant", content: "Conflicting role." } },
  ]), "claude_code", { task });
  assert.deepEqual(records.records.map(item => item.actor), ["unknown", "unknown", "agent"]);
  assert.ok(records.limitations.includes("conflicting_actor_role"));
});
test("Codex exec output does not fabricate human decisions from task metadata or token totals", () => {
  const input = jsonl([
    { type: "thread.started", thread_id: "synthetic-thread" },
    { type: "item.completed", item: { type: "agent_message", text: "Goal: verify the total." } },
    { type: "item.completed", item: { type: "command_execution", command: "DO_NOT_EXECUTE", aggregated_output: "Synthetic check passed." } },
    { type: "turn.completed", usage: { input_tokens: 123, output_tokens: 7 } },
  ]);
  const result = normalizeSelectedExport(input, "codex", { task });
  assert.deepEqual(result.records.map(item => item.actor), ["agent", "tool"]);
  assert.ok(Object.values(result.metrics).every(value => value === null));
  assert.doesNotMatch(JSON.stringify(result), /synthetic-thread|DO_NOT_EXECUTE/);
});
test("Codex mirrored rollout events do not double-count the same conversation", () => {
  const result = normalizeSelectedExport(jsonl([
    { type: "event_msg", payload: { type: "user_message", message: "Goal: selected task." } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Goal: selected task." }] } },
  ]), "codex", { task });
  assert.equal(result.records.length, 1);
});
test("malformed, partial, unknown and nontext content degrades explicitly without throwing away usable text", () => {
  const input = '{"type":"user",BAD}\n' + jsonl([
    { type: "unknown", secret: "SYNTHETIC_PRIVATE_SENTINEL" },
    { type: "user", message: { content: [{ type: "image", source: { url: "invalid.test" } }, { type: "text", text: "Selected human text." }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", name: "shell", input: { command: "DO_NOT_EXECUTE" } }] } },
  ]);
  const result = normalizeSelectedExport(input, "claude_code", { task });
  assert.equal(result.coverage, "partial");
  assert.equal(result.records.length, 1);
  for (const code of ["malformed_event_omitted", "unsupported_event_omitted", "non_text_content_omitted", "tool_invocation_omitted_not_executed"]) assert.ok(result.limitations.includes(code));
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE_SENTINEL|invalid.test|DO_NOT_EXECUTE/);
});
test("unknown portable versions, duplicate keys, multi-session selection and oversized inputs fail safely", () => {
  assert.throws(() => normalizeSelectedExport('{"schema_version":"future"}', "codex"), /unsupported_selected_export_version/);
  const duplicate = normalizeSelectedExport('{"type":"user","type":"assistant"}', "claude_code", { task });
  assert.equal(duplicate.records.length, 0);
  assert.ok(duplicate.limitations.includes("malformed_event_omitted"));
  assert.throws(() => normalizeSelectedExport(jsonl([{ type: "thread.started", thread_id: "one" }, { type: "thread.started", thread_id: "two" }]), "codex", { task }), /multiple_sessions/);
  assert.throws(() => normalizeSelectedExport("a".repeat(INPUT_LIMIT_BYTES + 1), "codex", { task }), /too_large/);
  assert.throws(() => normalizeSelectedExport("{}", "codex"), /requires_selected_task_context/);
});
test("portable exports preserve all actor labels and reject unknown fields/task families", () => {
  const messages = ["human", "agent", "tool", "reviewer", "unknown"].map(actor => ({ actor, channel: actor === "tool" ? "tool_result" : actor === "reviewer" ? "review" : "conversation", text: `${actor} selected synthetic evidence.` }));
  const input = { schema_version: "bl-selected-0.2", task, coverage: "selected_complete", messages };
  const result = normalizeSelectedExport(JSON.stringify(input), "codex");
  assert.deepEqual(result.records.map(item => item.actor), ["human", "agent", "tool", "reviewer", "unknown"]);
  assert.throws(() => normalizeSelectedExport(JSON.stringify({ ...input, extra: true }), "codex"), /invalid_selected_export/);
  assert.throws(() => parseTaskContext({ ...task, family: "employer" }), /invalid_task_context/);
  assert.throws(() => parseTaskContext({ ...task, not_applicable: { invented: "reason" } }), /invalid_indicator_context/);
});
test("portable malformed messages, contradictory channels and truncation produce missing flags", () => {
  const result = normalizeSelectedExport(JSON.stringify({
    schema_version: "bl-selected-0.2", task, coverage: "selected_complete",
    messages: [
      { actor: "human", channel: "tool_result", text: "Verify the synthetic total." },
      { actor: "human", channel: "conversation", text: "a".repeat(20000) },
      { actor: "invented", channel: "conversation", text: "Invalid." },
    ],
  }), "codex");
  assert.equal(result.records[0]!.actor, "unknown");
  assert.equal(result.records[1]!.text.length, 16384);
  assert.equal(result.coverage, "partial");
  for (const code of ["conflicting_actor_channel", "evidence_text_truncated", "malformed_message_omitted"]) assert.ok(result.limitations.includes(code));
});
test("equivalent explicitly supplied task contexts do not conflict because object keys differ in order", () => {
  const context = { ...task, not_applicable: { tone_preferences: "Numeric output.", iterative_refinement: "One step." } };
  const reordered = { ...task, not_applicable: { iterative_refinement: "One step.", tone_preferences: "Numeric output." } };
  const input = JSON.stringify({ schema_version: "bl-selected-0.2", task: context, coverage: "partial", messages: [] });
  assert.equal(normalizeSelectedExport(input, "codex", { task: reordered }).task.goal, task.goal);
});
