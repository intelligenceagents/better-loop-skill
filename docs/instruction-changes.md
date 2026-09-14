# Repository instruction change record

## Initial scoped instructions

Authorized scope: initialize this repository with public-specific development instructions and the portable Better Loop instruction skill.

The initial commit adds `AGENTS.md` (shared engineering rules), `CLAUDE.md` (Claude Code pointer to the same rules), and `skills/better-loop/` (portable instruction-only skill and host metadata). All paths are repository-local. No global files or other projects are modified. The commit diff is the complete reviewable scope.

Rollback: revert the initial commit to remove the seed, or remove only those newly added instruction paths in a reviewed follow-up commit. A host installation is a separate user action; uninstall instructions must remove only the chosen Better Loop skill copy.

The skill's capability status stays instruction-only. These files cannot authorize uploads, cloud services, benchmark reruns on private work, or changes to unrelated instructions.

## M1 implementation

The M1 contract implementation leaves `AGENTS.md`, `CLAUDE.md`, and `skills/better-loop/` unchanged from the initial scoped commit. The new host installation documentation describes optional repository-local copies; the build performs no installation or instruction edits. Revert an implementation commit to roll back its tooling changes. Preserve unrelated work when reverting.
