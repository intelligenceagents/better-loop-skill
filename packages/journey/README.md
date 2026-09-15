# Better Loop private journey

`@better-loop/journey@0.2.0-draft.2` retains a person's explicitly selected repository scope, bounded tracked text, deterministic diagnosis, actual host report and user-reported follow-up on their laptop. It makes no model or service request.

Choose exact Git worktree roots and a new dedicated state directory. The documented default is `<selected-root>/.better-loop/journey`; multiple roots can share an explicitly selected external directory. The package does not search for repositories, state, session histories or previous host configuration. Reuse the approved state path on later invocations.

```ts
import { createScope, useJourney, recordAssessment } from "@better-loop/journey";

await createScope({ stateDirectory, roots: explicitlyChosenRoots, task });
const selected = await useJourney({
  stateDirectory, host: "codex", excerptBytes: 2000, excerptFiles: 2,
  excerptPaths: ["the/selected/tracked-file.ts"],
});
// Only after the host has actually reviewed this snapshot:
await recordAssessment({
  stateDirectory, expectedCheckpoint: selected.checkpoint_id, host: "codex",
  report: actualHostReport,
});
```

`task` contains `family`, `goal`, `acceptance_criteria` and optional `not_applicable`, as in core. `actualHostReport` contains nonempty `summary`, `diagnosis`, `next_action`, `acceptance_check` and a `limitations` string array. This is a local report, never a capability capsule or public candidate. The host's configured model provider may process selected source/report text; the deterministic collector does not.

The first `useJourney` records a baseline. An unchanged scan returns the same underlying assessment and no new credit. A changed scan returns changed files/excerpts, a bounded previous host summary and explicit previous recommendation outcome. Excerpts default to eight files/8 KiB total; an exact repeatable relative-path filter and smaller byte/file limits support a short host call. Omitted content has not been reviewed by the host. Static hypotheses identify their actual source and whether its excerpt is present. AGENTS/CLAUDE instructions do not require skill trigger frontmatter.

Review excerpts use separate line-diff hunks for distant edits; unchanged middle lines are never labeled as removed. Byte budgets cover both old/new sides and all displayed hunks, with explicit clipping/omission metadata. Above the bounded comparison complexity, the result is labeled samples, not a diff. These are review excerpts, not apply-ready patches or proof that omitted additions are absent.

`recordAssessment` binds the actual host report to the selected checkpoint's `local_assessment_id`. A second host or narrative-only revision for that same assessment retains its advice ID and increments the report revision. Material changes to `next_action`/`acceptance_check` receive a new association and cannot inherit completed progress. Neither creates assessment/ability credit. This records reasoning about that historical snapshot; it does not rescan current source or independently verify human judgment. Only a host report matching the current local assessment is preferred as active coaching.

Other exports:

- `inspectJourney(stateDirectory, {includeEvidence?})` and `history(stateDirectory)` inspect only the selected local state. Raw source requires explicit `includeEvidence`.
- `updateScope({stateDirectory, expectedCheckpoint, roots, task})` requires an explicit new selection; it retains the scope ID, increments its revision and starts an incomparable baseline.
- `recordOutcome({stateDirectory, expectedCheckpoint, recommendationId, status, note, reflectionCompleted?, contentOrigin?, check?, checkEvidenceFile?})` retains explicit user feedback: `not_tried`, `declined`, `helped`, `did_not_help` or `inconclusive`. No outcome is inferred from Git activity. `FollowupCheck` is exported for controlled comparison/quality/origin/check fields.
- `resetJourney({stateDirectory, scopeId, expectedCheckpoint})` clears that scope's entire local evidence/history and starts a fresh revision. `forgetJourney({stateDirectory, scopeId})` removes only the selected dedicated state, leaving repository files intact.
- `recoverJourneyLock({stateDirectory, lockToken})` requires the exact lock token and a process known to be dead. It never breaks a potentially live lock.

All writes use private permissions, exclusive locks, immutable hash-linked checkpoint files and an atomic current pointer. Stale checkpoint IDs and corrupted history fail closed. An uncommitted orphan record is never history. Up to 64 checkpoints are retained; reaching the bound requires an explicit reset or new state. These integrity checks are not cryptographic attestation against the same user rewriting their own state.

Outcomes bind to material advice/acceptance and stable evidence identity. `checkEvidenceFile` explicitly selects existing bounded check text; only its hash is retained and nothing is executed. Otherwise evidence identity uses the selected repository snapshot. Identical outcomes are idempotent; note/status edits preserve first-observed chronology. A later-comparable milestone requires distinct selected evidence first observed after explicit reflection on that advice. Submission sequences and identical bytes copied to another path cannot supply that chronology. Answers to earlier same-scope advice remain possible after a delta, labeled historical. Older records without these bindings remain useful feedback but earn no current progress.

Collection is bounded to eight repositories, 1,000 tracked entries per repository, 64 KiB per eligible UTF-8 file, and 2 MiB total selected text. Exceeding a repository/total bound leaves the prior checkpoint unchanged. Choose a relevant repository scope within these limits; exclusions or smaller host excerpts do not remove the whole-collection bounds.

Only fixed bounded Git metadata argv run. No hooks, fsmonitor, extdiff, textconv, test, source-defined command, untracked scan, model or uploader runs. Filename filtering precedes reads; credentials, private artifact directories, generated outputs, binaries, oversized files, symlinks, hardlinks and paths outside the selected roots are excluded. Previously available evidence becoming unavailable invalidates comparison. Scope/framework/collection-policy changes and rewritten Git history also invalidate comparison. A Git author is not a human behavioral observation; quality, effort and resource metrics stay unknown.

Arbitrary symlink chains are rejected. On macOS only the verified system root aliases `/tmp` and `/var` normalize to `/private/tmp` and `/private/var`; links deeper in a selected path still fail. Do not place state in a synced/public directory, export it, or treat it as an OS sandbox against a hostile process under the same account.

## Readonly saved review

`reviewJourney(stateDirectory, {includeChanges?, excerptBytes?, excerptFiles?})` reads a coherent saved history and returns a private `bl-local-journey-view-0.1` projection. It does not reread live repository files, run Git, inspect another scope, or create state/progress. Existing private state stays compatible; no wire or contribution schema changed. Default change summaries omit source text (at most200 filenames); explicitly included excerpts default to4files/4000bytes with the existing bounded multi-hunk renderer. The comparison is the most recent saved assessment, not a claim that current disk contents are unchanged. Paths, history and report text remain private.

Draft.2 changes only excerpt presentation: keep complete hunks first, then a few contiguous windows of whole lines from larger hunks. Removed/added/context omissions and gaps are explicit; over-budget lines can remain entirely unshown. Group boundaries are readability hints, not parsed syntax or semantic review. Unseen callees and omitted additions remain unassessed; excerpts are not apply-ready patches. State/comparability/evidence chronology stay compatible.
