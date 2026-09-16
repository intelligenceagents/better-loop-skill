import { canonicalize, parseJson } from "@better-loop/contracts";
import { ACTORS, CHANNELS, INDICATORS, LOCAL_VERSION, TASK_FAMILIES, unknownMetrics } from "@better-loop/core";
import type { Actor, Channel, EvidenceRecord, Host, IndicatorId, NormalizedTask, TaskContext, TaskFamily } from "@better-loop/core";

export const SELECTED_EXPORT_VERSION = "bl-selected-0.2" as const;
export const ADAPTER_VERSION = "0.2.0-draft.1";
export const INPUT_LIMIT_BYTES = 2 * 1024 * 1024;
export const RECORD_LIMIT = 2000;
export const TEXT_LIMIT = 16384;
type ObjectValue = Record<string, unknown>;
const isObject = (value: unknown): value is ObjectValue => value !== null && typeof value === "object" && !Array.isArray(value);
const hasOnly = (object: ObjectValue, keys: string[]) => Object.keys(object).every(key => keys.includes(key));
const boundedString = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;

export function parseTaskContext(input: unknown): TaskContext {
  if (!isObject(input) || !hasOnly(input, ["family", "goal", "acceptance_criteria", "not_applicable"]) ||
      !TASK_FAMILIES.includes(input.family as TaskFamily) || !boundedString(input.goal, 4096) ||
      !Array.isArray(input.acceptance_criteria) || input.acceptance_criteria.length > 20 ||
      !input.acceptance_criteria.every(value => boundedString(value, 1024))) throw new Error("invalid_task_context");
  const task: TaskContext = { family: input.family as TaskFamily, goal: input.goal, acceptance_criteria: [...input.acceptance_criteria] as string[] };
  if (input.not_applicable !== undefined) {
    if (!isObject(input.not_applicable) || !hasOnly(input.not_applicable, Object.keys(INDICATORS)) ||
        !Object.values(input.not_applicable).every(value => boundedString(value, 500))) throw new Error("invalid_indicator_context");
    task.not_applicable = Object.fromEntries(Object.entries(input.not_applicable)) as Partial<Record<IndicatorId, string>>;
  }
  return task;
}

export interface NormalizeOptions { task?: TaskContext }

export function normalizeSelectedExport(text: string, host: Host, options: NormalizeOptions = {}): NormalizedTask {
  if (host !== "claude_code" && host !== "codex") throw new Error("unsupported_host");
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > INPUT_LIMIT_BYTES) throw new Error("selected_export_too_large");
  if (Buffer.from(text, "utf8").toString("utf8") !== text) throw new Error("invalid_unicode");
  const limitations = new Set<string>();
  const records: EvidenceRecord[] = [];
  let coverage: NormalizedTask["coverage"] = "partial";
  let format: NormalizedTask["source_format"] = host === "claude_code" ? "claude-code-jsonl" : "codex-jsonl";
  let task = options.task === undefined ? undefined : parseTaskContext(options.task);
  const add = (actor: Actor, channel: Channel, value: unknown) => {
    if (typeof value !== "string") { limitations.add("non_text_content_omitted"); return; }
    if (!value.trim()) return;
    if (records.length >= RECORD_LIMIT) { limitations.add("record_limit_reached"); return; }
    if (value.length > TEXT_LIMIT) limitations.add("evidence_text_truncated");
    // Source record ids, session ids, paths and provider metadata do not enter the normalized report.
    records.push({ id: `e${records.length + 1}`, actor, channel, text: value.slice(0, TEXT_LIMIT) });
  };
  let whole: unknown;
  try { whole = parseJson(text); } catch { /* JSONL is parsed independently below. */ }
  if (isObject(whole) && Object.hasOwn(whole, "schema_version")) {
    format = "selected-export-v1";
    if (whole.schema_version !== SELECTED_EXPORT_VERSION) throw new Error("unsupported_selected_export_version");
    if (!hasOnly(whole, ["schema_version", "task", "coverage", "messages"]) ||
        (whole.coverage !== "selected_complete" && whole.coverage !== "partial") ||
        !Array.isArray(whole.messages) || whole.messages.length > RECORD_LIMIT) throw new Error("invalid_selected_export");
    const embeddedTask = parseTaskContext(whole.task);
    if (task !== undefined && canonicalize(task) !== canonicalize(embeddedTask)) throw new Error("conflicting_task_context");
    task = embeddedTask;
    coverage = whole.coverage;
    for (const message of whole.messages) {
      if (!isObject(message) || !hasOnly(message, ["actor", "channel", "text"]) ||
          !ACTORS.includes(message.actor as Actor) || !CHANNELS.includes(message.channel as Channel) ||
          typeof message.text !== "string") {
        limitations.add("malformed_message_omitted"); continue;
      }
      // Conflicting role/channel assertions do not become human conversation.
      let actor = message.actor as Actor;
      if (message.channel === "tool_result" && actor !== "tool") { actor = "unknown"; limitations.add("conflicting_actor_channel"); }
      if (message.channel === "review" && !["reviewer", "unknown"].includes(actor)) { actor = "unknown"; limitations.add("conflicting_actor_channel"); }
      add(actor, message.channel as Channel, message.text);
    }
  } else {
    if (task === undefined) throw new Error("native_export_requires_selected_task_context");
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length > RECORD_LIMIT * 5) throw new Error("selected_export_too_many_events");
    const events: ObjectValue[] = [];
    for (const line of lines) {
      try {
        const event: unknown = parseJson(line);
        if (!isObject(event)) limitations.add("malformed_event_omitted");
        else events.push(event);
      } catch { limitations.add("malformed_event_omitted"); }
    }
    const sessions = new Set<string>();
    const eventIds = new Map<string, string>();
    const responseMessages = events.some(event => event.type === "response_item" && isObject(event.payload) && event.payload.type === "message");
    for (const event of events) {
      if (typeof event.session_id === "string") sessions.add(event.session_id);
      if (typeof event.sessionId === "string") sessions.add(event.sessionId);
      if (event.type === "session_meta" && isObject(event.payload) && typeof event.payload.id === "string") sessions.add(event.payload.id);
      if (event.type === "thread.started" && typeof event.thread_id === "string") sessions.add(event.thread_id);
      if (sessions.size > 1) throw new Error("multiple_sessions_select_one_task");
      const identifier = typeof event.uuid === "string" ? event.uuid : undefined;
      if (identifier) {
        const encoded = JSON.stringify(event);
        if (eventIds.has(identifier)) {
          if (eventIds.get(identifier) !== encoded) limitations.add("conflicting_duplicate_event_omitted");
          continue;
        }
        eventIds.set(identifier, encoded);
      }
      const blocks = (content: unknown, actor: Actor, channel: Channel) => {
        if (typeof content === "string") { add(actor, channel, content); return; }
        if (!Array.isArray(content)) { limitations.add("malformed_message_omitted"); return; }
        const prose: string[] = [];
        const flush = () => { if (prose.length) { add(actor, channel, prose.join("\n")); prose.length = 0; } };
        for (const block of content) {
          if (!isObject(block)) { limitations.add("non_text_content_omitted"); continue; }
          if (["text", "input_text", "output_text"].includes(String(block.type)) && typeof block.text === "string") prose.push(block.text);
          else if (block.type === "tool_result") {
            flush();
            if (typeof block.content === "string") add("tool", "tool_result", block.content);
            else if (Array.isArray(block.content)) {
              const toolTexts = block.content.filter(isObject).filter(item => item.type === "text" && typeof item.text === "string").map(item => item.text as string);
              add("tool", "tool_result", toolTexts.join("\n"));
              if (toolTexts.length !== block.content.length) limitations.add("non_text_content_omitted");
            } else limitations.add("non_text_content_omitted");
          } else if (["tool_use", "thinking", "redacted_thinking"].includes(String(block.type))) {
            limitations.add(block.type === "tool_use" ? "tool_invocation_omitted_not_executed" : "reasoning_content_omitted");
          } else limitations.add("non_text_content_omitted");
        }
        flush();
      };
      if (host === "claude_code") {
        if (["user", "assistant"].includes(String(event.type)) && isObject(event.message)) {
          const role = event.message.role;
          if (role !== undefined && role !== event.type) { limitations.add("conflicting_actor_role"); continue; }
          const actor = event.type === "assistant" ? "agent"
            : event.isMeta === true || event.isSynthetic === true || event.isReplay === true ? "unknown"
              : typeof event.parent_tool_use_id === "string" ? "agent" : "human";
          blocks(event.message.content, actor, "conversation");
        } else if (["system", "result", "stream_event", "rate_limit_event"].includes(String(event.type))) {
          if (event.type === "stream_event") limitations.add("stream_deltas_omitted_requires_complete_messages");
          if (event.type === "result" && event.is_error === true) limitations.add("host_reported_error");
        } else limitations.add("unsupported_event_omitted");
      } else {
        if (event.type === "response_item" && isObject(event.payload)) {
          const payload = event.payload;
          if (payload.type === "message") {
            if (payload.role === "user" || payload.role === "assistant") blocks(
              payload.content, payload.role === "assistant" ? "agent" : "human", "conversation");
            else if (!["system", "developer"].includes(String(payload.role))) limitations.add("unknown_role_omitted");
          } else if (["function_call_output", "custom_tool_call_output"].includes(String(payload.type))) {
            add("tool", "tool_result", payload.output);
          } else if (["function_call", "custom_tool_call", "reasoning"].includes(String(payload.type))) limitations.add("tool_or_reasoning_event_omitted_not_executed");
          else limitations.add("unsupported_event_omitted");
        } else if (event.type === "event_msg" && isObject(event.payload)) {
          if (["user_message", "agent_message"].includes(String(event.payload.type))) {
            if (!responseMessages) add(event.payload.type === "user_message" ? "human" : "agent", "conversation", event.payload.message);
          } else if (event.payload.type !== "token_count") limitations.add("unsupported_event_omitted");
        } else if (event.type === "item.completed" && isObject(event.item)) {
          if (event.item.type === "agent_message") add("agent", "conversation", event.item.text);
          else if (event.item.type === "command_execution") add("tool", "tool_result", event.item.aggregated_output);
          else limitations.add("tool_or_reasoning_event_omitted_not_executed");
        } else if (["thread.started", "turn.started", "turn.completed", "item.started", "item.updated", "session_meta", "turn_context"].includes(String(event.type))) {
          // Metadata and partial stream updates are not evidence of a person's decision.
        } else if (["turn.failed", "error"].includes(String(event.type))) limitations.add("host_reported_error");
        else limitations.add("unsupported_event_omitted");
      }
    }
    limitations.add("native_selection_completeness_unknown");
  }
  if (task === undefined) throw new Error("missing_task_context");
  if (limitations.size || records.length === 0) coverage = "partial";
  if (!records.length) limitations.add("no_usable_selected_evidence");
  if (coverage === "partial") limitations.add("selected_evidence_incomplete");
  return {
    schema_version: LOCAL_VERSION, host, source_format: format, task, records, coverage,
    limitations: [...limitations].sort(), metrics: unknownMetrics(),
  };
}

export const adapterCapabilities = () => ({
  version: ADAPTER_VERSION, protocol: SELECTED_EXPORT_VERSION,
  hosts: ["claude_code", "codex"] as const,
  formats: ["selected-export-v1", "claude-code-jsonl", "codex-jsonl"] as const,
  selection: "one_explicit_task", history_discovery: false, network: false, tool_execution: false,
  unknown_native_events: "omitted_with_partial_coverage", maximum_input_bytes: INPUT_LIMIT_BYTES,
});
