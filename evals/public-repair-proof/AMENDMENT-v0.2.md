# Harness amendment before the second attempt

Evaluator version: `bl-evidence-attribution-repair-0.2`.

The first frozen run (`513a92c33f59326c31e96c1715fff37ad56854a6`) failed compiler-input verification for both source versions. Its complete result is retained unchanged in `RESULTS.json`: zero evaluated cases, two infrastructure failures, and quality floor false. Both workers stopped at `unfrozen_compiler_input`, after compilation and before importing or calling either validator.

The original evaluator compared the temporary entrypoint's path spelling with the compiler's resolved input path. On this macOS environment, the temporary directory has a system alias. The amendment compares canonical filesystem paths for both the extracted source and the already hash-verified cached dependency files. It also retains the dependency's relative name in local diagnostics if an unexpected compiler input is encountered. No new source dependency is permitted.

`run-v0.2.mjs` otherwise preserves the exact cases, decision oracle, preservation checks, execution order and 24-case quality floor. The successful/failed classification of any probe cannot be changed by this path correction. The original protocol, evaluator, freeze and failed result remain available.

`FREEZE-v0.2.json` separately pins this amendment and the corrected evaluator before either validator is called. Execute `node evals/public-repair-proof/run-v0.2.mjs`; its default output is the new, exclusively created `RESULTS-v0.2.json`. Both arms are recompiled from the original source commits with the same frozen cached dependencies. The attempt remains subject to a 120-second outer timeout and 50 seconds per arm. No model, semantic reviewer, approval or publication is involved.

This is a disclosed infrastructure retry, not another independent task sample or a selected passing model attempt. The original software expectations were not tuned after observing validator outputs; no validator output existed in the first attempt.
