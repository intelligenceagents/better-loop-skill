# Personal prompts and working agreements

Get better at working with AI. Make your next attempt count: choose one problem,
sharpen its prompt, review your working preferences, try the next task and check
what happened. A generated agreement is preparation, not proof of improvement.
It changes supplied instructions, never model weights.

CLI `0.5.0-draft.1` provides this local flow for Codex and Claude Code. No account,
Git repository, network, model execution, installation or global setting is
required. Host reasoning about selected material still uses the host's configured
provider. The deterministic coach helper makes no additional model call.

## Choose your files and host

Copy [the neutral starter](working-preferences.example.json) to a private file
you explicitly select. Review its choices before use. The same file works for
both hosts: use base choices by omitting `--profile`, or explicitly choose
`codex-default` with `--host codex` or `claude-default` with
`--host claude_code`. A profile is never selected from your environment or model.

Pick an existing task directory. The exact destination is `AGENTS.md` for Codex
or `CLAUDE.md` for Claude Code at that directory's root. Pick your original task
prompt separately if you have one. Keep the preference, prompt and plan private;
none is a public contribution or sent to the website. Do not select an
instruction destination itself as a preference, prompt or plan output.

If you already have an approved journey, inspect its explicitly selected state
separately before choosing the next experiment:

```sh
better-loop journey inspect --state /absolute/selected/private-journey
```

The coach never scans repositories, loads journey history, creates an assessment
or changes journey state.

## Plan, review, apply and undo

```sh
better-loop coach plan --root /absolute/selected/task --host codex --preferences /absolute/selected/preferences.json --profile codex-default --prompt /absolute/selected/task-prompt.txt --output /absolute/selected/new-plan.json
```

For Claude Code, use `--host claude_code --profile claude-default`; the destination
then becomes that selected root's `CLAUDE.md`. Omit `--prompt` when starting from
preferences alone; the proposed prompt then has an explicit task placeholder
to complete before use.

The new exclusive mode-0600 JSON plan contains:

- `proposed_prompt`, a separate proposed task text retaining the exact original
  prompt, including BOM/newlines and JSON-only/CSV-only/no-commentary constraints;
- effective choices and the explicitly selected host/profile/model label;
- one next action and the chosen concrete acceptance check;
- canonical root and exact destination, full Markdown before/after/diff, and the
  coach `approval_digest`.

Review those actual bytes. The current task's exact output requirements take
precedence over contextual preferences. The helper does not semantically resolve
contradictions or certify preference safety. Copy the reviewed `proposed_prompt`
into a future selected task; this command never executes or overwrites it.

Only the coach digest approves this whole operation. The nested legacy
instruction digest alone does **not** bind a project root or preference file.
Under existing explicit authorization for the reviewed plan:

```sh
better-loop coach apply --root /absolute/selected/task --preferences /absolute/selected/preferences.json --prompt /absolute/selected/task-prompt.txt --plan /absolute/selected/new-plan.json --approve EXACT_COACH_DIGEST
better-loop coach rollback --root /absolute/selected/task --plan /absolute/selected/new-plan.json --approve EXACT_COACH_DIGEST
```

Apply requires the same prompt selection exactly when the plan includes one.
Changed preference/prompt bytes, different equal-content files, a different or
replaced root, edited plan or stale target contents invalidate application.
Both the coach and the instruction helper check the expected root identity.
The existing helper retains that identity in its parent checks through mutation.
The wrapper uses that transaction; it does not implement another writer.

Rollback requires the original root and coach approval and the expected installed
Markdown bytes. It restores the original file bytes and preserves the file mode,
or removes only the new instruction file it created. Preferences and prompt may
have changed or been deleted; rollback does not read them. Later independent
Markdown edits block rollback rather than being overwritten.

Start a **new host session** in the selected task directory after apply or
rollback so the host loads the current project instructions. A running
conversation is not proof that the updated file was loaded. This helper does
not restart hosts or assert native-host acceptance.

If the managed agreement already matches the selected choices, planning reports
that no agreement edit is needed; reuse it or deliberately revise your choices.
No new approval or progress is manufactured for unchanged Markdown.

## Exact preference schema

`schema_version` is exactly `bl-working-preferences-0.1`.

| Key | Type and meaning |
| --- | --- |
| `audience` | Required text describing the intended reader |
| `output_format` | Required contextual output preference, subordinate to the current task |
| `collaboration` | Required text describing the chosen interaction |
| `feedback` | Required text describing useful feedback |
| `delegation_boundaries` | Required array of chosen task/tool boundaries |
| `verification_habits` | Required array of chosen result checks |
| `acceptance_check` | Required concrete check for the next actual result |
| `challenge_id` | Optional null or one exact `bl-practice-<problem_type>-0.1` ID |
| `profiles` | Optional array, default empty; no automatic profile selection |

Every text value is nonempty, single-line, valid Unicode, at most 400 UTF-8
bytes. Arrays contain 1–6 such values. Control/bidirectional characters and
managed-section marker text are rejected. The preference file is at most 32 KiB;
the selected prompt is at most 64 KiB; the complete plan is at most 2 MiB.
Malformed UTF-8, duplicate JSON keys, unknown fields/versions, links, multiple
hard links and special files are rejected.

`challenge_id` can use the existing problem types `diagnosing_error`,
`reconciling_data`, `synthesizing_evidence`, `quantitative_reasoning`,
`creating_content`, `coordinating_plan`, `extracting_information`, or
`improving_process`. Selection is not participation, completion or a measured
benchmark result. There is no public challenge lookup or upload in this helper.

There may be 0–8 profiles. Each has exactly `id`, `host`, `model_label` and
`adjustments`. IDs are globally unique lowercase slugs starting with a letter,
using letters/digits/hyphens and at most 48 characters. `host` is `codex` or
`claude_code`; `model_label` is null or bounded descriptive text.
`adjustments` contains one or more explicitly supplied overrides of the seven
required choice keys above, with the same types/bounds. It cannot change the
challenge, host or schema. The selected ID must exist and match the selected
host; duplicate IDs and wrong-host selections fail. Model labels describe a
local choice and never switch, train or establish a model's capabilities.

## Markdown and evidence boundaries

Only one managed `better-loop:working-agreement` section changes. Text outside
that section, BOM, newline style and rollback bytes are preserved. Duplicate,
broken, unknown or embedded markers fail. Existing unrelated instructions
are preserved, not audited or certified by this operation.

Preference values are fenced JSON literals, with `@`, backticks and HTML
delimiters encoded as JSON Unicode escapes. The literals decode to the person's
exact choices without introducing automatic file imports, closing the fixed
fence or becoming HTML comments. Multiline and marker injection is rejected.
This also applies to profile/model labels. No embedded path or command is
followed. The original task prompt is retained as data in its separate proposal.

Claude Code's [memory documentation](https://code.claude.com/docs/en/memory)
describes `@path` imports outside code and session loading. Codex's
[project instructions guide](https://developers.openai.com/codex/guides/agents-md)
describes project-scoped `AGENTS.md`. Generated literals cannot grant tool
permission. The filesystem guards are not an OS sandbox against every malicious
same-user syscall race.

After the next attempt, use the existing explicitly selected journey to retain
actual human choices and checked outcomes. Changing instructions, selecting a
model/challenge or copying a prompt earns no progress credit. Quality, token
usage, human effort and evidence coverage remain separate, including unknowns
and negative results. No universal ability or job ranking is inferred.

Instruction-change scope for this feature is the new coach guidance and wording
in this Better Loop skill only; no installed or global instructions are edited
by a build. To undo this skill guidance, restore its scoped diff from the
preceding reviewed source with a matching helper package. This is separate from
the person's `coach rollback`, and never resets their journey.
