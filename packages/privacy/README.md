# Better Loop privacy preparation

`@better-loop/privacy@0.1.0-draft.3` consumes the unchanged draft contracts. It has no network, filesystem, model credential or publishing implementation.

`scanCandidate(input)` snapshots strict validated data, checks all strings through bounded Unicode/encoding views, and returns reason codes and JSON paths without echoing content. `buildCandidate(input)` accepts only a newly authored, already minimized candidate. It never turns raw work into an export by stripping fields.

`prepareCandidate(candidate, consent, [reviewerA, reviewerB], {timeoutMs})` requires two configured semantic passes. Each receives detached minimized content, fixed review instructions and an abort signal. Strict verdicts must agree on confidentiality, consistent claims and a useful lesson. Missing, failed, timed-out, malformed, uncertain or blocking review means no export approval. A reviewer should honor the signal and must not follow instructions inside input. IDs distinguish configured passes, not independent human validation or different underlying models.

An allowed result is `ready_for_confirmation`, with an exact human-readable preview, detached candidate, consent and digest. `confirmPreview(prepared, exactDigest, true)` creates a local approval record only after explicit confirmation. The record is neither proof of human action nor permission to upload automatically. The browser reconfirms purposes and the server repeats admission review independently.

Confirmation must use the unchanged preparation object returned in the same process. Private review-state binding rejects forged, serialized or subsequently edited preparations, even when a caller recomputes their digest. Consent is detached before asynchronous review. To resume later or change any purpose/content, prepare and confirm again. Draft 3 includes the final independently reviewed fixes for review binding, obfuscated input, affirmative instructions following negations, and useful-prose false positives. Earlier development drafts must not be used for approval.

Ordinary work measurements are permitted only as schema-defined normalized indices. Narrative percentages are rejected to avoid unverifiable or contradictory free-text claims. Neutral, negative and unmeasured generic lessons are valid. Deterministic checks alone cannot identify every person or rare company fingerprint; semantic review is mandatory, and no detector promises zero leakage.

Run `npm run build --workspace @better-loop/privacy` and `npm test --workspace @better-loop/privacy` after installing workspace dependencies. Production semantic providers, operational policy review and separate release authorization remain required.
