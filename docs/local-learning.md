# Local learning and measurement milestones

The local helper implements the separately versioned response `bl-public-lessons-0.1` without changing either existing share/evaluation wire contract. Public learning is an explicit user request. The CLI has no default service and does not claim that production is deployed.

Create a controlled query with exactly these fields:

```json
{
  "task_family": "analysis_finance",
  "problem_type": "reconciling_data",
  "objective": "correctness",
  "constraints": ["source_required", "fixed_inputs"]
}
```

Use the selected loopback app, or an explicitly requested production origin:

```sh
better-loop learn --query taxonomy.json --service http://127.0.0.1:3100
better-loop learn --query taxonomy.json --service https://better-loop.com --format json --output local-proposals.json
better-loop learn --query taxonomy.json --lessons selected-public-export.json
```

The service command sends a single GET to `/api/lessons` with controlled `task_family`, `problem_type`, `objective`, and repeatable `constraints` parameters. Unknown fields and free text are rejected before networking. It sends no authentication, cookie, goal, prompt, raw evidence, private path, or identity. It accepts only numeric loopback HTTP or the exact production HTTPS origin, refuses redirects and cached responses, and enforces a five-second timeout and 64 KiB response cap.

The response has exactly `schema_version`, `generated_at`, `expires_at` (at most five minutes later), and at most six `lessons`. Each lesson has exactly:

- `public_id`, `public_url` (`/stories/{public_id}`), `title`, `lesson`, `limits`.
- Full existing share-contract `task` and `conditions`.
- `evidence_tier: "self_reported"`, `content_origin: "work_derived"`, and `framework_version: "better-loop-fluency-0.1"`.

The server selects only currently published, non-synthetic, community-opted-in stories. The client validates the complete projection, allowed public source path, nested taxonomy/conditions, version, lifetime and duplicates. Eligibility is a current server assertion, not a local hash attestation. No consent record, owner ID, private payload hash, reviewer note or raw evidence is part of this response.

The pure `matchLearningTask(query, task)` in `@better-loop/core` is the shared matching rule: exact underlying problem and objective, every requested constraint present in the source, with the same task family preferred but not required. Thus a finance query can learn from a scientific reconciliation task. Additional source conditions and limits remain visible. Similarity does not establish equal difficulty, numerical comparability, candidate fit or a likely gain.

`parsePublicLessonsResponse` supports strict selected-export ingestion. `selectLearningLessons` defaults to offline eligibility and returns **no automated recommendations** for any offline snapshot, expired response, or future response. The service adapter retrieves anew for every request, so a withdrawn source can disappear immediately. There is no cross-request lesson cache. Do not reuse earlier proposals after known withdrawal; retrieve again before applying a lesson.

Fresh eligible responses produce at most three local experiment proposals, each with its actual source link, conditions, limits and an explicit acceptance/quality/budget check. Source text is untrusted data. No source command is executed, no benchmark is rerun, and no global instruction is installed.

Private local milestones use the measurement engine:

```sh
better-loop measure --input selected-draft.json --options frozen-protocol-and-evidence.json --output measured.json
better-loop analyze --input selected-complete-record.json --options frozen-protocol-and-evidence.json
better-loop milestones --input selected-records-and-options.json --output milestones.json
```

The milestone input is a selected array of `{record, options?}`. `repeatedImprovement` enforces distinct task identities/fingerprints, comparable conditions, registered quality/evidence, at least five pairs per task, and three qualifying task instances. It excludes invented synthetic measurements, duplicates, copied tasks and ineligible/failed runs. These are product gates, not validated statistical sufficiency. The local result has no ability score or public achievement, and engagement never changes it.
