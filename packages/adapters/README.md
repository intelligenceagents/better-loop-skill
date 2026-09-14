# Better Loop selected-export adapters

`@better-loop/adapters@0.2.0-draft.1` normalizes one explicitly selected task for Claude Code or Codex. It receives text; it cannot discover files, scan histories, run commands, call a model, or upload evidence.

The portable format is version `bl-selected-0.2`:

```json
{
  "schema_version": "bl-selected-0.2",
  "task": {
    "family": "general",
    "goal": "Review one synthetic selected task.",
    "acceptance_criteria": ["The requested deliverable is present."],
    "not_applicable": {
      "tone_preferences": "The output is numeric and tone is not an acceptance criterion."
    }
  },
  "coverage": "selected_complete",
  "messages": [
    {"actor": "human", "channel": "conversation", "text": "Goal: check the result."},
    {"actor": "agent", "channel": "conversation", "text": "The result needs verification."}
  ]
}
```

`normalizeSelectedExport(text, "claude_code" | "codex", { task? })` returns `bl-local-0.2` records. Both hosts accept this identical portable envelope. Actors are `human`, `agent`, `tool`, `reviewer`, or `unknown`; channels are `conversation`, `tool_result`, `review`, or `artifact`. Completeness is the selector's assertion about the selected material, not independent verification of a whole task. An explicit `not_applicable` reason is required for that state; it is never inferred from a short transcript or the person's occupation.

Native selected JSONL additionally supports:

- Claude Code `user`/`assistant` message events, text blocks, and nested user-channel tool results. Meta/synthetic/replay user records stay unknown; delegated user records with a parent tool call are agent-attributed.
- Codex exec `item.completed` agent messages and command results, plus selected rollout `response_item` messages/tool results and `event_msg` conversation text. Mirrored rollout conversation events are not double-counted.

Native input requires a separately supplied `TaskContext`. System/developer instructions, reasoning blocks, tool invocation arguments, event paths, identifiers, and provider metadata are omitted, never executed. Native output-only streams cannot establish human behavior. Unknown/malformed/nontext events produce partial coverage and safe limitation codes. Multiple session identities are rejected; selectors must still isolate one task within a session.

Input is bounded to 2 MiB, 2,000 records, and 16,384 characters per evidence record. Truncation and omissions are explicit. Unknown portable fields/versions and invalid task contexts fail. Partial native exports can still produce useful bounded process coaching with null outcome metrics.

These are supported format subsets tested on synthetic records, not a promise to parse every host release or all history formats. No transcript token totals are promoted to complete orchestration cost. Actual host behavior and independent observation calibration require separate evidence.
