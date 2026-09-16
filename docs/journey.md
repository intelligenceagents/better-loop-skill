# Returning to selected repository work

A journey keeps the approved scope, earlier assessment, actual host reasoning and explicit recommendation outcomes on the person's laptop. The first invocation records a baseline. Later invocations assess only changed eligible evidence; unchanged work recalls the previous advice without a new assessment. This works through the same CLI in Claude Code and Codex, including separate host sessions.

Choose the current Git worktree root or exact multiple roots, a task context and a new dedicated state directory. The default location to offer is `<selected-root>/.better-loop/journey`; it is a documented choice, not a directory the CLI silently discovers or creates. For multiple repositories, repeat `--root` and explicitly select one state location. Keep that path in the user's approved task context so later sessions can reuse it. There is no global state index or home/session/repository crawl.

```sh
better-loop journey create --state /chosen/repo/.better-loop/journey --root /chosen/repo --task selected-task.json --format json
better-loop journey use --state /chosen/repo/.better-loop/journey --host codex --excerpt-path src/selected.ts --excerpt-files 2 --excerpt-bytes 2000 --format json
```

`selected-task.json` contains `family`, the person's actual `goal`, and `acceptance_criteria`. The task families match the existing core assessment. These examples name placeholders; choose actual authorized work and do not fabricate an example assessment.

The collector reads fixed Git metadata to enumerate tracked filename/status information before filtering content. It never runs hooks, tests, text converters, external diffs or commands from source. It rejects arbitrary symlinks and hardlinks, excludes untracked files, credentials, generated/private artifact directories, binary/oversized/invalid UTF-8 content, and stays within the exact roots. Collection allows at most eight roots, 1,000 tracked entries per root, 64 KiB per eligible file and 2 MiB of text in total. Exceeding a root/total bound fails without replacing the prior checkpoint; choose a relevant repository within the bounds.

Host excerpts are separately bounded: defaults are eight changed files and 8 KiB total. The repeatable `--excerpt-path` filter chooses exact relative filenames, with smaller file/byte limits as above. Diagnosis may consider the locally collected text, but `recommendation_sources` says which cited source is in the returned excerpt selection. An omitted source or callee remains unverified by the host, not evidence of missing validation. Static findings include the actual filename, line and local change ID. AGENTS/CLAUDE files have no SKILL trigger-frontmatter requirement.

Excerpts use bounded exact line matching with separate hunks for distant edits. Unchanged middle guidance is context or omitted, never presented as a deleted replacement block. Bytes are shared across selected files/hunks and old/new lines; clipping and omitted-line/hunk counts are explicit. If a line comparison would exceed two million dynamic-programming cells, the fallback is labeled `bounded_samples_not_diff`, not deletions/additions. These excerpts are for review, not an apply-ready patch. Clipped or omitted content cannot establish that a rule disappeared.

Results distinguish:

| State | Meaning |
|---|---|
| `baseline` | First bounded snapshot; no before/after outcome |
| `changed` | New selected text evidence and a new deterministic diagnosis, with bounded prior context |
| `unchanged` | Same underlying evidence/assessment; no new assessment or credit |
| `invalidated` | Scope, framework, collection policy, evidence availability or Git history changed incompatibly; fresh baseline, no improvement claim |

Git author names, commit counts and agent edits do not establish human judgment. Quality, resources and measured improvement remain unknown. Tests appearing in source are not executed test outcomes. No selected source, paths, hashes or private state are public contribution fields.

After the host actually reasons over the selected evidence, save its concise report:

```sh
better-loop journey record-assessment --state /chosen/repo/.better-loop/journey --expected RETURNED_CHECKPOINT --host claude_code --input actual-host-report.json --format json
```

The report contains exactly `summary`, `diagnosis`, `next_action`, `acceptance_check`, and `limitations` (a string array). It records this host's actual conclusions about the selected checkpoint. It does not rescan source during saving. Its `local_assessment_id` binds it to the assessed snapshot. A retained older host report is historical context after a new delta; current coaching uses the new diagnosis until a matching new host report is saved. Rewording a summary can retain the advice association; changing the action or acceptance criterion gives a new association and does not inherit completed progress. Neither creates new ability credit.

Ask which advice the user tried and retain the user's answer:

```sh
better-loop journey outcome --state /chosen/repo/.better-loop/journey --expected CURRENT_CHECKPOINT --recommendation SELECTED_REPORT_ID --status not_tried --note-file actual-user-note.txt --acknowledge --origin work_derived --format json
better-loop journey outcome --state /chosen/repo/.better-loop/journey --expected CURRENT_CHECKPOINT --recommendation SELECTED_REPORT_ID --status did_not_help --note-file actual-user-followup.txt --check selected-followup.json --check-evidence selected-actual-result.txt --format json
better-loop journey progress --state /chosen/repo/.better-loop/journey
```

Use `--acknowledge` only when the user explicitly completed a reflection. Status is `not_tried`, `declined`, `helped`, `did_not_help` or `inconclusive`; no status is inferred. `selected-followup.json` contains exactly `content_origin`, `change`, `comparison`, `outcome`, `quality_floor`, `critical_regression`, and `check_result`, using the exported `FollowupCheck` types. A claimed improvement requires a comparable check, met quality floor and no observed critical regression; it remains self-reported.

`--check-evidence` explicitly selects one existing bounded actual result file. It is read, not executed; only its digest stays in private outcome state. It cannot point inside the journey state or at a credential-named file. Without that option, the current bounded repository snapshot supplies evidence identity. Merely declaring a follow-up is useful feedback, but a later-comparable milestone also requires distinct selected evidence first observed after reflection on the same recommendation. Submission count, note edits, changed verdict labels and identical bytes under another path cannot supply that chronology. A simultaneous first reflection/check is not a later check. This does not require rerunning side-effecting work.

An exact duplicate submission returns the existing checkpoint. Note/status revisions retain original evidence chronology. Earlier reports remain answerable by their exact ID within the same scope revision, but that feedback is labeled historical and cannot mark new advice completed. Older outcome records without evidence/context bindings remain historical/unverified. Scope invalidation clears current progress continuity. Explicit synthetic/copy/revision-only/unknown or noncomparable checks do not qualify; meaningful negative and neutral results remain useful learning. No universal score, public badge or independently verified ability is inferred.

Use `inspect`, `history` and `progress` with the selected `--state`. Raw retained source requires `inspect --include-evidence --format json`; ordinary inspection omits it. `update --expected ... --root ... --task ...` explicitly changes the scope and starts a fresh revision. Unchanged Markdown output is brief; JSON includes bounded context for host use.

`reset --scope-id ... --expected ...` deliberately clears all retained history/evidence in that state and begins a fresh revision. `forget --scope-id ...` removes only the selected dedicated state. Neither touches repository source. State is mode 0700 with mode 0600 files, immutable hash-linked checkpoints, an atomic current pointer and an exclusive lock. Stale IDs and corrupt history fail closed; an uncommitted orphan file is not history. At 64 checkpoints, explicitly reset or choose new state. A dead lock can be recovered only with its exact token; potentially live locks are never broken. Incomplete creation with a valid identity can be explicitly forgotten. An unexpected file is not silently deleted.

On macOS, only the verified system aliases `/tmp` and `/var` normalize to their `/private/...` targets; arbitrary/deeper symlinks remain rejected. Keep state out of shared/synced directories. This is local integrity and containment, not an OS sandbox or attestation against another process using the same account.

Journey state commits before result output. If a selected output already exists or writing the result fails, inspect state before retrying; the committed checkpoint remains available and output bytes are never overwritten.

Deterministic collection/diagnosis makes no model request. A host reading selected raw excerpts or reports uses its configured provider unless verified local inference is selected. “No Better Loop upload” does not mean all processing stayed local. Public contribution is separate: explicitly prepare a minimized candidate/capsule, select the four purposes, obtain two whole-contribution reviews and confirm the exact preview. Journey objects cannot be serialized as public capsules. See [CLI sharing](https://github.com/intelligenceagents/better-loop-skill/blob/main/packages/cli/README.md), [privacy](https://github.com/intelligenceagents/better-loop-skill/blob/main/skills/better-loop/references/privacy.md) and [capability evidence](https://github.com/intelligenceagents/better-loop-skill/blob/main/packages/evidence/README.md).

## See your saved progress

Use `better-loop journey view --state <known-approved-state> --output <new-private.html>` to see one next move/acceptance check, evidence-bound practice states, saved source before/after, and your actual host-report/outcome history. Output must be a new `.html`/`.htm` file outside dedicated state. The viewer is a readonly snapshot, never a fresh assessment; the returned receipt confirms no state change or automatic browser open.

No external assets, scripts, analytics, server or network are needed. Raw source is omitted unless `--include-changes` is explicitly selected (default4files/4000bytes, adjustable downward). Full paths and saved summaries are still private. Open the selected file yourself, keep it outside public/synced locations, and never use it as a public contribution. A checked negative result is retained honestly. Unverified metrics stay unknown; source edits and story edits are not task improvement.

[Portable host prompts](https://github.com/intelligenceagents/better-loop-skill/blob/main/docs/host-prompts.md) make first use, multi-repository choice, return, viewer and optional exact sharing explicit in both hosts. Exact host length compliance remains a known reliability limit in prior native validation; the concise guidance is not a guarantee.

For deterministic desktop/mobile/keyboard QA of an explicitly selected generated view, run `npm run test:journey-view -- /path/to/private-view.html`. It needs an installed Playwright Chromium; `BETTER_LOOP_BROWSER_CHANNEL=chrome` selects an existing Chrome installation instead. It installs nothing, opens no user browser window, blocks HTTP requests and reports only check results.

Draft.2 accepts optional `journey view --format json` for its stdout receipt while preserving HTML output. The HTML export makes no additional model calls; host analysis of selected context uses its configured model provider. Excerpts now prioritize complete hunks and contiguous whole-line windows. Counts/gaps identify omitted removed, added and context lines. A long statement may be entirely omitted; omitted additions or callees are unassessed, not absent. The actual public SKILL/viewer source regression retains complete statements within the same4,000-byte/two-path budget; this deterministic presentation check does not establish task improvement.
