# Evaluation cases

`scenarios.json` defines behavioral cases to run against supported hosts. These cases have **not** been executed against Claude Code or Codex. Validating their structure does not mean their expected behaviors passed.

Run each prompt with and without the skill on isolated public/synthetic inputs, then compare old/new skill versions. Preserve outputs, failures, time and actual token telemetry when available. Freeze the task rubric and success criteria before execution. Use held-out variations and independent review to avoid tuning only to these examples.

The source method and calibration plan are in [foundation.md](../skills/better-loop/references/foundation.md). Metric interpretation is in [assessment.md](../skills/better-loop/references/assessment.md). Tests of privacy leakage require actual seeded inputs and a working scanner; these prose scenarios do not implement that scanner.

Publish the first genuine benchmark even if results are neutral. Report uncertainty and regressions. Keep all private-work evaluations outside the repository.
