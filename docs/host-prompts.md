# Copy a request into your host

The portable [host-prompts.json](../skills/better-loop/references/host-prompts.json) artifact is version `bl-host-prompts-0.1`. It supplies the same five requests for Codex and Claude Code: current repository, exact multiple repositories, return to known state, readonly local viewer, and optional exact sharing. It is static copy, not a runner or new contribution schema.

For the website `/start` integration, show the selected host's request with a copy action. Leave placeholders visible for the user to fill **in their host**. Do not ask the website to collect local root/state/output paths, task text, evidence or reviewer configuration. JSON-string/array placeholders keep path values distinguishable from surrounding instructions, but are not a security boundary. Never evaluate a template or interpolate values into a shell command. A copy action is not publication consent.

Both hosts need their chosen installed Better Loop skill and compatible helper. The requested first scope can be supplied by the user before invocation; do not reask already supplied choices. A return uses only a known approved state. The view request requires an explicit new `.html` path outside that state, omits raw excerpts, and does not auto-open. Selected local material used by host reasoning may be processed by that host's configured provider.

## Exact sharing seam

The native host uses the installed CLI (or its operator-selected absolute entrypoint). Candidate, capability, purpose and reviewer files are separate explicitly selected local inputs:

```sh
better-loop draft-share --input minimized-candidate.json --capability selected-capability.json --consent selected-purposes.json --reviewers selected-reviewers.json --timeout-ms 30000 --output new-preview.json
better-loop draft-share --input minimized-candidate.json --capability selected-capability.json --consent selected-purposes.json --reviewers selected-reviewers.json --timeout-ms 30000 --output new-approved.json --confirm --digest EXACT_WHOLE_CONTRIBUTION_DIGEST --handoff --target-origin http://127.0.0.1:3100 --ttl-ms 120000
```

The second command requires the user's actual confirmation of the exact first preview/purposes/recipient/digest. It reruns both configured reviews and calls prepare/confirm in the same process; preview plus confirmation therefore uses four semantic reviews. No saved preparation can be deserialized as approval. `--capability` is optional only for legacy candidate-only sharing, whose legacy approval grants no discovery consent. `--handoff` requires confirmation and an explicitly supported target. Without it, the approved JSON remains local.

The host never reads website credentials/OTPs or browser authentication data. The user opens the temporary local URL and uses its website button; the separate application requires review, authentication and explicit publication. The helper does not auto-open or publish. A configured local application is not a claim of live production availability.
