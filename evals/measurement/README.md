# Synthetic measurement acceptance fixtures

`synthetic-draft.json` is the seed evaluation example with its derived summary
removed. All measurements, model names, references, outcomes, and actors are
invented. It has `content_origin: "synthetic"` and is ineligible as actual
benchmark evidence, human achievement, or population/cohort evidence.

The executable acceptance cases live in
[measurement tests](../../packages/measurement/tests). They cover arithmetic,
missing/zero values, quality regressions, protocol tampering, all planned outcomes,
telemetry/cache/overhead accounting, comparable tasks, repeated-task gates,
deterministic expectations, blinded labels, and the packed CLI/import surface.
Tests that exercise a `public_benchmark` or `private_work` eligibility branch
still use invented in-memory measurements; no such test establishes real execution.

The parent/coordinator owns actual host experiments. Genuinely executed approved
public/synthetic task runs with preserved outputs, actual telemetry and a frozen
protocol are different from these invented fixtures. They can provide actual
benchmark protocol evidence even when underpowered, neutral, adverse, or below
the improvement gates. They still do not provide human achievements or population
counts. See [measurement documentation](../../docs/measurement.md).
