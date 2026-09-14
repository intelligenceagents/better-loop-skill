# Repository instruction change record

## Initial scoped instructions

Authorized scope: initialize this repository with public-specific development instructions and the portable Better Loop instruction skill.

The initial commit adds `AGENTS.md` (shared engineering rules), `CLAUDE.md` (Claude Code pointer to the same rules), and `skills/better-loop/` (portable instruction-only skill and host metadata). All paths are repository-local. No global files or other projects are modified. The commit diff is the complete reviewable scope.

Rollback: revert the initial commit to remove the seed, or remove only those newly added instruction paths in a reviewed follow-up commit. A host installation is a separate user action; uninstall instructions must remove only the chosen Better Loop skill copy.

The initial skill's capability status was instruction-only. These files cannot authorize uploads, cloud services, benchmark reruns on private work, or changes to unrelated instructions.

## M1 implementation

The M1 contract implementation leaves `AGENTS.md`, `CLAUDE.md`, and `skills/better-loop/` unchanged from the initial scoped commit. The new host installation documentation describes optional repository-local copies; the build performs no installation or instruction edits. Revert an implementation commit to roll back its tooling changes. Preserve unrelated work when reverting.

## M2 local helper integration

Authorized scope: implement useful selected-task assessment, prompt improvement, static audits, portable host guidance, executable capability detection, and the subsequently assigned local measurement/learning integrations in this repository. The reviewed diff changes `skills/better-loop/SKILL.md`, its `agents/openai.yaml`, the privacy reference's capability description, and the new `scripts/detect-helper.mjs`. It does not modify global host configuration or another project. The source-root `AGENTS.md`/`CLAUDE.md` remain unchanged.

The changes distinguish deterministic helper cues from host reasoning, describe the actual helper protocol/version, preserve exact prompt output contracts, and require real configured privacy reviewers for clearance. Missing/incompatible helpers stay explicit; no uploader is introduced.

Rollback: revert the M2 instruction-file diff or restore these selected paths from the previous reviewed commit. For separately installed skill copies, restore only the retained previous Better Loop directory. The helper's `instructions plan/apply/rollback` workflow offers a full scoped diff and exact-byte preconditions for later explicitly selected edits; it never installs itself or changes instructions during a build.

## Findings from actual native-host review

The user authorized two precise follow-up edits after the native Claude review of real selected repository evidence: make brand-independent prompt/workflow/skill-improvement intent explicit in the description, while excluding ordinary task execution; and skip the sharing invitation when the user declined upfront or requested no invitation.

The scoped diff changes only those two paragraphs in `skills/better-loop/SKILL.md`; `evals/m2/skill-trigger-expectations.json` records positive and negative expectations. It does not rewrite the prior host results or treat expectations as completed tests. Rollback restores those two paragraphs from the preceding reviewed snapshot and retains the prior evidence record. No global installation, license, telemetry, or publication permission changes.

The same real-host evaluation exceeded two explicit response budgets: 953 words against 700 and 909 against 750. The user authorized one concise assessment paragraph requiring exact format/length compliance, selection of the strongest few observations and up to three changes, and omission of irrelevant modes, sections or appendices. Rollback removes only that added paragraph. This guidance is a proposed fix; the original length failures remain recorded and a targeted follow-up is separate evidence.

## Whole-response budget correction after the real follow-up

The parent's real prompt-improvement follow-up in `evals/host-validation/results/capabilities-followup.json` invoked the skill without requiring its brand name, ran only the authorized detector, made no writes and omitted the sharing invitation. Its complete answer still contained 290 words against a 250-word maximum, including a capability preamble and a separate explanation of the changes. Length therefore remained a failure. The rewrite also introduced a blanket stop-and-report rule for a check failure unrelated to the worker's changes; that restriction was not in the original task.

The user authorized replacement of two assessment paragraphs in `skills/better-loop/SKILL.md`: budget the entire visible response before drafting, target at most 80% of the maximum to leave a counting margin, omit preambles and optional rationale for tight rewrites, and check the complete answer; preserve existing authorization without adding blanket stops, approval gates or unrelated prohibitions. Counting does not expand tool authorization. One expectation case records the same real prompt and whole-response/scope requirements in `evals/m2/skill-trigger-expectations.json`. These are guidance and expectations, not evidence that a later host run passed. No model call was made for this correction, and the parent's scripts/results are unchanged.

Rollback: restore only those two skill paragraphs from commit `30d737062c33d62690a84cdb3973d2bb0f3b4bfe` and remove the added expectation case. Preserve the prior evidence and this change record, or annotate this entry with the rollback outcome. No global skill copy, helper source, README or STATUS change is included.
