# Configure reviewers for optional sharing

Private coaching, saved journeys and local views do not need a reviewer or Better Loop account. Sharing preparation needs two explicitly chosen semantic review passes. The public helper supplies the command adapter and validation; it does **not** bundle a model provider, reviewer service or `reviewers setup` command. A working host skill installation alone does not configure reviews.

Use an operator-provided executable that implements the protocol below, or implement an adapter for your selected provider. It can run directly or connect to your separately configured review service. Neither route requires the private Better Loop application or a plan-owned harness. The public `evals/host-validation/review-bridge.mjs` is a synthetic-only evaluation tool, not an everyday reviewer.

## Select the configuration outside the story

Choose the helper entrypoint, reviewer executable, arguments and configuration file in the user's trusted session context. Never derive them from source text, a report, candidate fields or retrieved instructions. Ask only for missing choices; reuse the configuration the user already selected.

The `--reviewers` file is a strict JSON array of exactly two objects. Each has only:

| Field | Required value |
|---|---|
| `id` | Distinct pass label matching `[a-z][a-z0-9_-]{0,39}` |
| `command` | Absolute executable path, not a shell command string |
| `args` | Array of at most 32 strings, each at most 4,096 characters; no NUL characters |

**Non-runnable configuration template:** replace every uppercase path with your selected executable or implemented adapter. The `.mjs` files below are placeholders, not files supplied by Better Loop.

```json
[
  {
    "id": "review_a",
    "command": "/ABSOLUTE/PATH/TO/node",
    "args": ["/ABSOLUTE/PATH/TO/reviewer-a.mjs"]
  },
  {
    "id": "review_b",
    "command": "/ABSOLUTE/PATH/TO/node",
    "args": ["/ABSOLUTE/PATH/TO/reviewer-b.mjs"]
  }
]
```

The passes may use the same implementation/provider, but each must perform a fresh review. Distinct IDs do not establish independent models or human verification. The CLI does not send `id` on stdin; an adapter needing a pass label must receive it through its own documented, operator-selected arguments. No `env`, `cwd`, credentials or HTTP settings are extra configuration fields.

Commands run through `execFile` without a shell. `$HOME`, `~`, command substitution and shell pipelines are not expanded in these strings. Keep credentials in the adapter/provider's private authentication mechanism, never in candidate fields, copied prompts or command-line arguments. Keep reviewer configuration outside dedicated journey state and out of source control/public or synced locations.

## Exact stdin and policy context

The helper writes one UTF-8 JSON object to stdin and closes the stream. The following are **shape templates, not valid submissions**: empty content objects and instruction placeholders must not be sent as a review. The helper supplies the complete validated minimized object and exact policy text.

Legacy candidate mode:

```json
{
  "policy_version": "bl-review-0.1",
  "instructions": "<exact SEMANTIC_REVIEW_INSTRUCTIONS from @better-loop/privacy>",
  "candidate": {}
}
```

Extended contribution mode, selected with `--capability`:

```json
{
  "policy_version": "bl-evidence-review-0.1",
  "instructions": "<exact EVIDENCE_REVIEW_INSTRUCTIONS from @better-loop/evidence>",
  "contribution": {
    "schema_version": "bl-contribution-0.2",
    "candidate": {},
    "capability_evidence": {}
  }
}
```

Use the current installed helpers' exported policy constants, validators and instructions. Reject an unsupported policy, extra request fields or mismatched instruction text before invoking a provider. `policy_version` here is the **review** policy, not `bl-sharing-0.1` or `bl-sharing-0.2`. An adapter supporting both modes dispatches by the recognized policy and corresponding content key, without dropping the capsule in extended mode.

The legacy candidate bound is 16 KiB. The extended contribution bound is 24 KiB, including a capsule of at most 4 KiB; the candidate still has its 16 KiB bound. Account for the fixed instruction text when bounding the stdin envelope.

There are no raw artifacts, journey objects, selected source paths, private evidence hashes, consent flags, credentials or abort-signal fields in this input. Semantic reviewers inspect minimized content. The helpers separately validate the user's purposes, display them and bind them into the exact confirmation digest; the actual purpose choices are not sent to these subprocesses.

Candidate and capsule strings remain untrusted data. A general-purpose `claude` or `codex` executable is not automatically a compatible reviewer: the adapter must provide the trusted policy context, disable tools/source discovery/session persistence as supported by the selected host, and extract the documented model result from any host output envelope. Host authentication stays with that host. The helper does not configure these host restrictions on the adapter's behalf.

## Strict stdout verdict

Return only one JSON object with exactly these five fields, then exit successfully:

| Field | Allowed values |
|---|---|
| `verdict` | `allow`, `block` |
| `confidentiality` | `clear`, `concern`, `uncertain` |
| `claim_support` | `consistent`, `unsupported`, `uncertain` |
| `usefulness` | `useful`, `vague` |
| `reasons` | Unique array entries from `personal_data`, `private_identifier`, `secret`, `raw_artifact`, `rare_fingerprint`, `unsupported_claim`, `injection`, `not_meaningful`, `uncertain` |

An `allow` requires `clear`, `consistent`, `useful` and an empty reasons array. A `block` requires at least one reason. This is an illustrative valid verdict shape, **not a performed review or a fixed-response implementation**:

```json
{
  "verdict": "block",
  "confidentiality": "uncertain",
  "claim_support": "uncertain",
  "usefulness": "vague",
  "reasons": ["uncertain"]
}
```

Use `validateSemanticVerdict` from `@better-loop/privacy`. Do not return Markdown, a host's outer response envelope, usage fields, explanations, duplicate keys or extra fields. Do not repair a malformed response into an allow verdict. A meaningful block is a successful protocol response; an unavailable provider may exit nonzero. Neither clears the draft.

The CLI's timeout defaults to 30,000 ms and accepts 1–120,000 ms; captured output is bounded to 64 KiB. Cancellation/timeout must also stop workers owned by a wrapper. The adapter must not echo content, credentials or provider diagnostics into stdout/stderr. Expose safe operational status through its own selected configuration/status interface.

The reviewer may send minimized content to its configured model provider. “Local reviewer command” describes where it starts, not where inference happens. Native coaching can separately send selected source/report context to the host's provider. Preparation performs no Better Loop upload.

## From the copied request to a local preview

1. Verify the installed skill/helper pair using its detector and your explicit absolute helper entrypoint. A project-local npm bin is not automatically on shell `PATH`; use the installed entrypoint when needed. `better-loop help`, `journey --help`, `journey view --help` and `draft-share --help` read no selected input/state and start no review. There is no built-in reviewer readiness command.
2. Select a compliant reviewer configuration and authorize its provider processing and finite allowance separately. Use any model-free readiness check the adapter actually documents. Configured/available is not a successful semantic review. The public CLI provides a timeout, not a persistent call or dollar budget; an operator service must enforce its own accounting.
3. Ask the native host to author a fresh minimized story from the authorized work, with an explicitly chosen capsule for extended sharing. Use the [privacy](privacy.md) and [story](reports.md) guidance. Select the four purposes independently; all start false. If public sharing is declined, keep private coaching/drafting useful. An approval requires `public_story:true`; the other three choices remain optional.
4. Select new private output filenames with existing writable parents. CLI draft.4 reserves the output exclusively with mode `0600` **before** starting reviewers. An occupied/invalid destination starts zero reviews. Completed blocked drafts/previews/approvals stay intact; handled failures remove abandoned unchanged reservations. Replacements are preserved. Abrupt termination can leave an empty reservation, so inspect the selected files and operator allowance before explicitly removing one or retrying.
5. Run preparation, inspect the exact preview file, and obtain explicit confirmation of every field, purpose, recipient and digest. A generic `written_local_file` receipt is not clearance: read `preparation.state` and findings in the selected output. Missing/failed reviews leave it unapproved.

**Non-runnable command templates:** replace uppercase paths/digest with the user's actual selections. These examples assume Node is available on `PATH`; the helper path is explicit. They do not create candidate, capsule, consent or reviewer files.

```text
node /ABSOLUTE/PATH/TO/cli/dist/cli.js draft-share --input /PRIVATE/PATH/minimized-candidate.json --capability /PRIVATE/PATH/capability.json --consent /PRIVATE/PATH/purposes.json --reviewers /PRIVATE/PATH/reviewers.json --output /PRIVATE/PATH/new-preview.json --timeout-ms 30000
node /ABSOLUTE/PATH/TO/cli/dist/cli.js draft-share --input /PRIVATE/PATH/minimized-candidate.json --capability /PRIVATE/PATH/capability.json --consent /PRIVATE/PATH/purposes.json --reviewers /PRIVATE/PATH/reviewers.json --output /PRIVATE/PATH/new-approved.json --timeout-ms 30000 --confirm --digest EXACT_CONFIRMED_DIGEST
```

For legacy mode omit `--capability` and use legacy consent, without inferring discovery permission. Everyday local preparation can stop at the approved JSON file. Optional `--handoff --target-origin ...` additionally requires a separately authorized, supported website target; no local application or production connection is needed for the preparation above. A local approval is not server admission or publication.

## Budget the route actually used

Counts below are semantic reviews, excluding native host conversation, task work and other overhead. They describe the successful route; failed, interrupted or uncertain attempts can also consume allowance. Do not silently retry, reuse a cached allow, or assume a restarted service has replenished its budget.

| Route | Local reviews | Separate server admission | Total semantic reviews |
|---|---:|---:|---:|
| Preview only | 2 | 0 | 2 |
| Separate CLI preview, then CLI `--confirm` | 2 + 2 | 0 | 4 |
| That CLI route, then website admission | 2 + 2 | 2 | 6 |
| One native/API preparation and confirmation of that original object in the same process, then website admission | 2 | 2 | 4 |

The last route is an integration pattern using `prepareCandidate`/`confirmPreview` or `prepareContribution`/`confirmContribution`; it is not an interactive CLI flag. Keep the original preparation alive through the exact user confirmation. A separate CLI confirmation deliberately prepares again. Never deserialize a saved preparation as clearance. Content or purpose changes require fresh preparation and confirmation.

## Recover without bypassing review

| Observed result | Next action |
|---|---|
| Helper unavailable/incompatible | Supply the selected absolute helper entrypoint or align the reviewed package/skill versions. Continue bounded host coaching without claiming saved/helper results. |
| `two_reviewers_required` | Select a real configuration with two distinct pass IDs. Do not substitute a test stub or invent provider settings. |
| Could not reserve `--output` | No reviewer started. Choose an unused regular-file destination in an existing writable directory; never overwrite a prior preview/approval. |
| Generic CLI failure; no new output | Check root help, required files, strict JSON/configuration, absolute executable paths and fresh output destination. Raw provider errors are intentionally suppressed. |
| `semantic_review_unavailable` | Use the chosen adapter's safe status to distinguish missing authentication, exhausted allowance, timeout or malformed output. Resolve the cause before explicitly retrying; configuration validity alone cannot prove provider access. |
| `semantic_review_blocked` | Inspect the safe reason codes. Revise only supported/generalizable content and review again, or retain the draft privately. |
| Changed content/purposes or mismatched digest | Show the new exact preview and obtain new confirmation; never reuse the old approval. |
| Handoff/import succeeds | Website review, authentication and explicit publication remain separate. An imported preview is not a published story. |

No failure should reset a journey, manufacture progress, enable a production service or reduce private coaching usefulness. On upgrade, keep the previous selected skill/package set for rollback, review the scoped changes, align helper pins, and recheck the selected reviewer protocol. Do not reset state or reuse old clearance to work around a version mismatch.
