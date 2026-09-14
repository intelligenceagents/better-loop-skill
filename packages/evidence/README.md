# @better-loop/evidence

Versioned, minimized evidence for useful learning and role-relevant public discovery. The package performs no network I/O, source collection or upload.

`Contribution` wraps the unchanged candidate schema with `CapabilityEvidence`: controlled human-attribution, quality-check, follow-up and public-benchmark fields. No raw evidence, paths, local hashes, names, employers, dates or source URLs are permitted in the capsule. The rubric is descriptive and uncalibrated. `locally_recorded` remains a client claim, not independent verification.

`validateContribution` and `validateContributionApproval` check strict structure, bounds and cross-field consistency. They do not establish privacy, work authenticity or user approval.

`prepareContribution(contribution, consent, [reviewerA, reviewerB])` applies the existing privacy scanner and two distinct configured semantic passes over the complete minimized contribution. Providers are supplied by the caller and disclosed to the user. Invalid, missing, disagreeing, uncertain or timed-out review blocks preparation.

Only `confirmContribution(originalPreparation, exactDigest, true)` can confirm the unchanged in-process reviewed snapshot. JSON copies cannot forge preparation. The digest binds every field and all four purposes, including separate candidate discovery opt-in. A returned approval is a local receipt; browser publication still requires the exact preview, chosen account, explicit publish action and independent server admission.

Legacy candidate and approval contracts remain unchanged. Legacy public stories are not automatically opted into candidate discovery. The new approval version is `bl-local-approval-0.2`, sharing policy `bl-sharing-0.2`, review policy `bl-evidence-review-0.1`.

Inputs from untrusted transports must be parsed as JSON before calling these APIs. Live JavaScript objects and Proxies are executable code and are not a secure input boundary. Errors contain bounded codes and schema locations, not supplied content.

Run `npm run check --workspace @better-loop/evidence` from the workspace. Isolated test fixtures are engineering inputs, not real community contributions.
