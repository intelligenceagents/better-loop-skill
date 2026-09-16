# Personal coach implementation

The [installed coach guide](https://github.com/intelligenceagents/better-loop-skill/blob/main/skills/better-loop/references/coach.md) contains the
neutral starter, exact preference fields and CLI plan/apply/rollback procedure
for both hosts. CLI `0.5.0-draft.1` is the coordinated integration version.

`packages/cli/src/coach.ts` exports `coachCommand(args)`, `parseWorkingPreferences`,
`planCoaching`, `validateCoachPlan`, `applyCoaching` and `rollbackCoaching`.
The CLI dispatcher receives `{value, output, markdown}` and uses the existing
exclusive private-output writer. Help returns before selected I/O. Typed
`CoachPlan` and `WorkingPreferences` describe only private local data.

The `bl-coach-plan-0.1` envelope binds canonical root path/device/inode, fixed
host-specific destination, exact preference selection/hash, optional original
prompt selection/hash/bytes, selected host/profile, effective choices, proposed
prompt and full `bl-instruction-plan-0.2`. One canonical digest covers the entire
plan. Validation checks its derived prompt/agreement and nested plan, not only
an arbitrary supplied digest. Apply checks the current selected input bytes;
rollback checks installed target bytes without rereading preferences or prompt.

PERSON-01 is addressed by this envelope plus the backward-compatible optional
`InstructionScopeIdentity` passed into `planInstructionChange` (fourth argument)
and `applyInstructionChange` (fifth argument after direction). The helper compares
that identity during root capture and retains its checked parent identities
through mutation. Existing callers without the optional identity retain their
interface; their legacy digest alone remains relative-path/content-bound.
Focused tests include cross-root/new-file replay, replaced roots and replacement
at the wrapper-check/helper-capture seam for apply and rollback.

The coach imports no journey, discovery, provider or transport module. Existing
journey state, shared wire/policies, model weights and global configuration are
unchanged. Host/model profiles are explicit choices, not behavioral inference.
The neutral starter and deterministic tests establish no native-host execution,
semantic assessment, improvement or training result.
