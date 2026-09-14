# Contributing

Use a scoped branch and reviewable commits. Read [AGENTS.md](AGENTS.md) and [STATUS.md](STATUS.md). Keep synthetic examples clearly labeled; do not include user work or local environment metadata in patches, logs, issues, or test output.

Run the checks documented in [README.md](README.md). State what changed, tests actually run, limitations, and rollback. A passing structural test is not a privacy review or measured improvement.

The JSON schemas are versioned contracts. Discuss compatibility before changing their meaning. Preserve both schema checks and semantic cross-field checks. Keep behavioral taxonomy separate from task outcome metrics and verification tiers.

Instruction changes must show a scoped diff and rollback. Never install repository instructions into global configuration as part of a build. The initial instruction scope and rollback are recorded in [docs/instruction-changes.md](docs/instruction-changes.md).

Report vulnerabilities according to [SECURITY.md](SECURITY.md). Do not put sensitive reports or raw evidence into public issues.
