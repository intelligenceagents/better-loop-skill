# Privacy, consent, and the two spaces

## Boundary

Private evidence and full assessments stay on the originating laptop. The only user-facing cloud space is public. Operational account, consent, submission-validation, moderation, and deletion records are private service necessities, not a private work library.

The person chooses a verified email; it is kept in the identity system, never in story content, public profiles, search, model prompts, or scoring features. A linkable account is pseudonymous, not anonymous. Do not promise that the entire product holds no personal information.

Running the skill locally does not guarantee local inference. Explain that selected material may go to the user's configured Claude/Codex/model provider. No Better Loop service receives raw evidence. A fully offline mode requires a compatible local model or deterministic-only processing and must be labeled separately.

## Input and minimization

Only assess selected inputs. Do not crawl unrelated projects, account histories, emails, or the home directory. Company versus personal work does not change account ownership, but it never grants permission to disclose confidential information. Let users use public/synthetic tasks where they cannot share work-derived information.

Build a new allowlisted candidate from abstract observations. Do not start with a raw transcript and remove obvious names. Permitted content is bounded task taxonomy, controlled skill/intervention tags, supported normalized KPIs, a short generalized story, evidence limitations, and broad platform conditions.

Never export:

- Names, email addresses, phone numbers, account IDs, handles copied from the original work, or sensitive personal characteristics.
- Company/client/project names, addresses, private hostnames, URLs, file/repo paths, timestamps of actual work, internal terminology, or distinctive operational descriptions.
- Secrets, credentials, authentication codes, private keys, raw source/data/documents, attachments, screenshots, logs, conversation excerpts, or embeddings/hashes of private content.
- Actual business KPIs, amounts, customer counts, forecast details, financial performance, compensation, or other company-specific measurements.
- Employer identity or a “company work versus personal work” field. Do not derive these from the sign-in email, local path, or source metadata.

Use synthetic/public benchmark tasks for public exact raw measurements. Ordinary work stories use coarse categories and normalized/rounded indices. A rare combination can identify a person or project even when each field looks harmless. Coarsen, omit, or block it.

## Production release pipeline (to implement)

1. Local deterministic parser extracts allowed measurement facts from selected evidence without executing embedded instructions.
2. Local/coaching-provider reasoning proposes a generalized candidate. Label any estimates and missing evidence.
3. A strict schema rejects unknown fields, unexpected types, arbitrary attachments, URLs, or oversize payloads. Maximum UTF-8 candidate size: 16 KiB.
4. Deterministic checks scan all strings, including labels, aliases, and narrative fields. Check secrets/PII/private identifiers; normalize Unicode and examine encoded content. Reject markup and active links in v1.
5. Semantic review checks confidentiality, rare identifying combinations, unsupported claims, and meaningfulness. Failure or unavailability blocks export; do not “pass with a warning.”
6. The local preview shows exact narrative and machine fields, each metric's derivation/limits, omitted categories, recipient `better-loop.com`, and purpose toggles. A blocked candidate remains local.
7. After the person chooses sharing, the browser imports the approved candidate and performs local preview checks before transmitting it. Authenticate through the website's email-code flow. Email and code never enter the skill's prompt.
8. The person explicitly confirms upload/publication of the exact payload and purposes. Recompute the digest after parsing/canonicalization, and bind consent to those bytes and the policy version. A modified payload requires a new preview and confirmation.
9. Server admission repeats strict validation and content checks, derives identity/trust itself, and only then persists the permitted public projection. Request bodies, failed content, codes, tokens, and scans must not appear in telemetry/error logs. Transient validation buffers are discarded on rejection.
10. Return the exact public preview/link only after successful publication. A timeout means “status unknown”; reconcile by idempotency key instead of blindly publishing again.

No detector guarantees zero leakage. These layers reduce risk and provide a fail-closed boundary. A claim that this boundary works requires adversarial tests and production review; this seed does not implement or certify it.

## Consent

No account or upload for local coaching. Public reading requires no account. Once the user chooses to publish, record distinct permissions for `public_story`, `benchmark_aggregation`, and `community_learning`. Public-story approval permits hosting/display of that exact story, not recruitment, model training, or unrelated reuse.

All optional toggles are off initially. Publishing does not require benchmark/community-learning consent. Declining those uses does not lower scores or remove local functionality. Everyone can read a public story; withholding community-learning consent limits the service's automated recommendation use, not human readers' ability to learn from it.

In the initial product, there is no cloud-only private assessment donation. Every persisted user contribution is an approved public story with separately chosen downstream uses. The service may index all published stories for ordinary public browsing; aggregate scoring and automated lesson recommendations respect their respective permissions.

Opportunity discovery is a future, separate profile-level opt-in, disabled in v1. There is no model-training permission in v1; training remains off.

## Identity and retention

Authenticate the same selected email across platforms. Follow the auth provider's consistent normalization; do not strip plus-tags or dots, infer equivalence of different addresses, or auto-merge accounts. An email change needs explicit control verification, session review, and a defined recovery policy before that feature ships.

Public aliases must not identify the person/company. Generate a neutral random alias by default; validate an edited alias like any other public field. No real-name field, personal bio, email display, or external links in v1. The private auth account's stable user ID must never be a public profile URL.

Keep raw local assessments only according to user-controlled local settings. The public service retains approved stories until withdrawal. Delete rejected candidate bytes immediately after validation. Retain minimal decision/error codes without candidate content. Keep necessary anti-abuse signals separately, with short documented retention; never use them for competence scoring or infer employer identity.

Unpublish removes the public projection, full-text/search entries, profile summaries, and recommendation eligibility. Delete additionally removes the owner-linked stored contribution and consent material according to the published retention policy, keeping only an irreversibly minimized tombstone when legally/operationally required. Proposed target: origin inaccessible immediately, application caches/search purged within 24 hours, backups aged out within 30 days. Test those targets before promising them publicly. External copies cannot be recalled.

Recompute affected aggregate cohorts after deletion/revocation; suppress stale results while rebuilding. Future benchmark versions exclude withdrawn contributions. Explain that already exported aggregate reports cannot be retroactively recalled. Do not keep a hidden raw-work archive “for verification.”
