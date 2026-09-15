// Generated from the committed public benchmark freeze. Build verifies exact equality.
export const FROZEN_REGISTRATION = {
  "id": "bl-public-approval-binding",
  "version": "0.1",
  "registry_version": "bl-public-work-registry-0.1",
  "status": "frozen_before_execution",
  "content_origin": "actual_public_repository_work",
  "public_repository": "https://github.com/intelligenceagents/better-loop-skill",
  "source_commit": "990428dadb3061453b54d3b078b1c8434d4e5d47",
  "source_commit_subject": "Implement reviewed local privacy preparation and exact consent binding",
  "sources": [
    {
      "path": "packages/privacy/src/index.ts",
      "frozen_file": "sources/packages__privacy__src__index.ts",
      "public_url": "https://github.com/intelligenceagents/better-loop-skill/blob/990428dadb3061453b54d3b078b1c8434d4e5d47/packages/privacy/src/index.ts",
      "sha256": "c92640f6c9d22ad0203344b160262d63d6b79036de00374b88e8bfd71728e7a0"
    },
    {
      "path": "packages/privacy/test/privacy.test.ts",
      "frozen_file": "sources/packages__privacy__test__privacy.test.ts",
      "public_url": "https://github.com/intelligenceagents/better-loop-skill/blob/990428dadb3061453b54d3b078b1c8434d4e5d47/packages/privacy/test/privacy.test.ts",
      "sha256": "8e149e7541c75bea9b790e01fcccd1185ce1c23324495e8ff0cdd19457e17b7f"
    },
    {
      "path": "packages/contracts/src/canonicalize.ts",
      "frozen_file": "sources/packages__contracts__src__canonicalize.ts",
      "public_url": "https://github.com/intelligenceagents/better-loop-skill/blob/990428dadb3061453b54d3b078b1c8434d4e5d47/packages/contracts/src/canonicalize.ts",
      "sha256": "fafc95384a21122afa21b7bdaeec419ae0e60643725f4f1d24e71020d3d62ae4"
    },
    {
      "path": "packages/contracts/src/digest.ts",
      "frozen_file": "sources/packages__contracts__src__digest.ts",
      "public_url": "https://github.com/intelligenceagents/better-loop-skill/blob/990428dadb3061453b54d3b078b1c8434d4e5d47/packages/contracts/src/digest.ts",
      "sha256": "397816dfd58e1539d52f0b1cc85cf824926fa6af84e548f1407f487277037db5"
    }
  ],
  "framework_version": "better-loop-fluency-0.1",
  "capability_rubric": "bl-work-evidence-0.1",
  "task_contract_version": "bl-task-0.1",
  "judge_version": "bl-approval-binding-judge-0.1",
  "metric_definition_version": "bl-metrics-0.1",
  "conditions_version": "bl-approval-binding-readonly-0.1",
  "task": {
    "task_family": "software",
    "problem_type": "diagnosing_error",
    "objective": "correctness",
    "difficulty": "moderate",
    "difficulty_basis": "rubric_estimated",
    "constraints": [
      "source_required",
      "tool_limited",
      "format_required",
      "fixed_inputs"
    ]
  },
  "execution": {
    "owner": "coordinator",
    "model_calls_by_package": 0,
    "outputs_at_freeze": 0,
    "maximum_new_calls_across_entire_extension": 8,
    "maximum_seconds_per_call": 120,
    "maximum_reported_api_usd_per_claude_call": 0.5,
    "maximum_model_execution_minutes_across_extension": 25,
    "arms": [
      "baseline",
      "with_guidance"
    ],
    "paired_order": [
      "baseline_then_with_guidance",
      "with_guidance_then_baseline"
    ],
    "allowed_activity": "Read frozen public files and produce an answer only. No execution of source, repository mutations, network, publishing, model tools, or side-effecting reruns.",
    "budget_includes": "Parent/worker/judge/retry calls count against the coordinator-owned extension budget. Local deterministic tests are not model calls.",
    "retries": "Do not replace failures. Retain all attempted outputs and record any retry as another budgeted call.",
    "measurement": "Retain quality decisions and missing coverage separately. Record known parent, worker, judge, retry and cache resources; unknown telemetry stays null. No output-character token estimates."
  },
  "limitations": [
    "One public code-reasoning task; not representative of other task families or independently held-out.",
    "Sources and rubric are public and contamination is possible.",
    "Existing source tests establish software behavior only, not model performance.",
    "A benchmark ID or self-reported completion is not independent verification, human attribution, or hiring validity.",
    "No new model outputs or measured improvement exist at registration.",
    "This registry is not a security audit."
  ],
  "protocol_files": [
    "cases.json",
    "rubric.json",
    "BASELINE.md",
    "GUIDANCE.md",
    "PROTOCOL.md"
  ]
} as const;
export const FROZEN_RUBRIC = {
  "version": "bl-approval-binding-judge-0.1",
  "output_schema": "bl-approval-binding-answer-0.1",
  "checks": [
    {
      "id": "original",
      "decision": "accept",
      "reason": "original_reviewed_state"
    },
    {
      "id": "wrong_digest",
      "decision": "reject",
      "reason": "exact_digest_required"
    },
    {
      "id": "not_confirmed",
      "decision": "reject",
      "reason": "explicit_confirmation_required"
    },
    {
      "id": "edited_candidate",
      "decision": "reject",
      "reason": "reviewed_snapshot_changed"
    },
    {
      "id": "edited_purpose",
      "decision": "reject",
      "reason": "reviewed_snapshot_changed"
    },
    {
      "id": "edited_preview",
      "decision": "reject",
      "reason": "reviewed_snapshot_changed"
    },
    {
      "id": "edited_receipts",
      "decision": "reject",
      "reason": "reviewed_snapshot_changed"
    },
    {
      "id": "json_clone",
      "decision": "reject",
      "reason": "original_object_identity_required"
    },
    {
      "id": "shallow_clone",
      "decision": "reject",
      "reason": "original_object_identity_required"
    },
    {
      "id": "caller_consent_changed",
      "decision": "accept",
      "reason": "caller_consent_snapshotted"
    },
    {
      "id": "reviewer_copy_changed",
      "decision": "accept",
      "reason": "reviewer_input_detached"
    },
    {
      "id": "key_order_only",
      "decision": "accept",
      "reason": "canonical_key_order_ignored"
    }
  ],
  "required_limits": [
    "local_approval_is_not_server_verification",
    "no_upload_performed",
    "no_human_ability_inference"
  ],
  "grading": {
    "case": "Exact controlled decision and reason required per case. An incorrect answer is not missing evidence.",
    "coverage": "Known supplied cases / 12; missing cases remain missing, never a zero task rating.",
    "result": "met requires all twelve case checks and all three limits; not_met means complete but one or more checks fail; incomplete means missing or malformed output.",
    "index": "No universal score or population percentile is computed. All check outcomes are retained."
  }
} as const;
export const FREEZE_SHA256 = "0bd0e5ed2c9e5c7cada28a83656fbdf4fc19b221b5b42a45648af4d4870bc580" as const;
