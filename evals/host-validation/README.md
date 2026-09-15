# Actual host validation

Current extension evidence is in [real returning-host validation](returning-journey.md): six native Codex/Claude sessions on actual selected repository work, with cross-host recall, changed-only assessment, unchanged reuse and retained failures. The [frozen public-work benchmark](../public-work-benchmark/RESULTS.md) is a separate actual one-pair result. Earlier experiments below remain historical and retain their original input classification and limitations.

These records separate actual model executions from the origin of the task data. The earlier pilot and privacy probes used authored synthetic tasks. Later capability checks assessed actual Better Loop repository work after the user requested real evidence. No fictional task is a community contribution.

## Results retained on 2026-09-14

| Check | Observed result | Limit |
|---|---|---|
| Installed Claude skill, actual selected implementation/review | Skill invocation, helper detection and selected reads completed; human/agent attribution and unknown measures preserved | 953 words against a 700-word limit |
| Explicitly loaded guidance, actual repository analysis | Actionable changes and an unapproved generalized draft | 909 words against a 750-word limit |
| Ordinary architecture question | No skill or tool invocation | One negative case |
| Prompt improvement after first guidance correction | Brand-independent Skill invocation, allowed detector only, no edits or sharing invitation | 290 words against a 250-word limit; retained as a failure |
| Prompt improvement after whole-response correction | Same prompt; installed Skill and detector only, no added approval/stop rules or sharing invitation | 258 words against the same 250-word limit; formatting reliability remains unresolved |
| Generic unmeasured privacy candidate | Both configured actual Claude calls allowed the useful generic lesson | Authored probe, not proof of general privacy |
| Rare project combination | Both actual semantic calls blocked a fingerprint missed by literal scanning | One authored probe; no calibrated detection rate |
| Local application semantic bridge | Four real Claude calls accepted create/revision test candidates; local lifecycle integration completed | Synthetic test candidate, no production integration or real story |
| Frozen paired pilot | All 12 actual calls met all six JSON/ledger checks; tokens increased in every pair | Two synthetic tasks; no measured quality gain or efficiency claim |

The [final follow-up](results/capabilities-final-followup.json) uses the same real prompt and the same whole-response 250-word check after the second scoped guidance correction. Its result is separate evidence; earlier failures are not overwritten. The 250-word threshold belongs only to that test request. Better Loop has no general 250-word report limit. Exact host output-length compliance is not established by these runs.

The actual work-derived candidate and its two real semantic reviews remain in the private coordination review packet. Neither founder approval nor publication has occurred. Raw selected evidence is not part of these public result files.

## Pilot interpretation

The frozen [registration](benchmark-registration.json) and runner were committed before execution in `a751b582ca5baa327f3c0aaf3feee68f5c6b8cbc`. All attempts and neutral/negative results are retained in [raw results](results/benchmark-raw.json) and [analysis](results/benchmark-analysis.json).

Three pairs on ledger A increased mean per-pair reported tokens by 17.04%; three pairs on ledger B increased them by 20.12%. All six prespecified quality checks passed in both arms. Repeated inputs within a ledger are not independent task instances. The measurement engine awards no resource-improvement or repeated-improvement benefit; shared setup overhead is unknown and cohort/calibration evidence is insufficient.

The preregistered method follows the baseline/comparison structure of `anthropics/skills` at commit `34040c9c568585f6929bedeaad110ad08f079624` (Apache-2.0). No upstream source was copied. Exact JSON grading is deterministic, blinded and permits ties. The typed measurement envelopes were derived after execution from the committed registration without changing prompts, inputs, rubric, ordering, metric or budgets; the files explicitly record that derivation time.

Per-model input, output, cache-read and cache-write telemetry is retained, including auxiliary host model usage. Host-reported API cost is a list-price estimate, not cash billing. CLI elapsed time is not model inference time. Missing model time, human effort, cash billing and shared preparation overhead remain unknown. Output characters are never substituted for token telemetry.

## Execution and budgets

The runtime of this earlier evaluation was Claude Code2.1.269. It did not exercise native Codex; subsequent actual Codex sessions are in the [returning-host report](returning-journey.md). Native Claude sessions in this earlier evaluation used an isolated temporary plugin and only the selected reads, Skill tool and exact helper detector command. Hooks, other MCP tools and session persistence were disabled. No global skill installation, assessment upload or production request was made.

The initial budget allowed 24 invocations at 120 seconds and a host cost cap of USD0.50 each. It covered one authentication smoke call, four semantic probes, 12 pilot calls, four local application semantic calls, and three capability calls. The initial protocol described synthetic-only data; the user subsequently selected real repository work for the capability phase. That scope change is explicit here, not retroactively edited into the frozen protocol.

The later real-work phase allowed four additional invocations: two semantic reviews of the real minimized draft and two targeted native skill follow-ups. The final follow-up has its own pre-run budget record in the private coordination repository. No additional ledger pilot or side-effecting engineering task was rerun.

The scripts are explicit research tools and are not invoked by normal builds or checks. They use the operator's existing Claude configuration when deliberately executed and can incur provider usage. Capability outputs refuse overwriting an existing record. Private native traces stay in a temporary local directory; public records retain scrubbed outputs, allowed tool names/arguments and numerical telemetry.

Reanalysis after building the measurement package needs no model call:

```sh
node evals/host-validation/analyze-benchmark.mjs
```

This regenerates only the derived analysis (including its derivation timestamp). Preserve a reviewed copy if comparing an exact prior artifact.

## Claim boundaries

The observed skill can support selected-task coaching, prompt proposals, static audit advice and scoped instruction proposals. Its descriptive English cue rules are not independently calibrated classifiers. Seven-family unit coverage does not establish field validity in every discipline. Privacy review is mandatory and fail-closed but is not a guarantee. Length failures and the negative resource result constrain the claims made by this release.
