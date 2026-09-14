# Implementation status

## Seed foundation

- Authored: portable instruction-only skill, draft `0.1.0` schemas, synthetic fixtures, behavioral scenario definitions, repository-specific instructions.
- Implemented: Python seed contract and link checks.
- Not implemented: TypeScript package foundation, normalized host adapters, assessment engine, privacy sanitizer/export, paired benchmark runner, website/authentication/publishing.
- Not tested: Claude Code or Codex behavioral runs, sanitizer effectiveness, genuine improvement, live service.

Seed validation: `python3 tools/validate_context.py` PASS (2 schemas, 4 synthetic fixtures, 15 rejection cases, 1 missing-evidence case, 16 scenario definitions, 36 local links). `git diff --check` passed.

Next: complete the M1 public TypeScript contract/development foundation. M2–M4 remain later work.
