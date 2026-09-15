// Generated from the retained actual public execution report; build checks exact equality.
export const PUBLIC_RESULTS_SUMMARY = {
  "version": "bl-public-work-results-0.1",
  "benchmark_id": "bl-public-approval-binding",
  "benchmark_version": "0.1",
  "status": "real_executions_retained",
  "source_commit": "990428dadb3061453b54d3b078b1c8434d4e5d47",
  "freeze_commit": "0aab3f442e48e9a705575bfa5b2283349781b2cb",
  "judge_version": "bl-approval-binding-judge-0.1",
  "host": "claude_code",
  "host_version": "2.1.270",
  "pairs": 1,
  "order": "baseline_then_with_guidance",
  "observed_outcome": "no_quality_gain_more_reported_tokens",
  "arms": [
    {
      "arm": "baseline",
      "result": "met",
      "cases_passed": 12,
      "expected_cases": 12,
      "limits_passed": 3,
      "expected_limits": 3,
      "total_reported_model_tokens": 34617,
      "estimated_api_cost_usd": 0.22328,
      "host_wall_duration_ms": 11799
    },
    {
      "arm": "with_guidance",
      "result": "met",
      "cases_passed": 12,
      "expected_cases": 12,
      "limits_passed": 3,
      "expected_limits": 3,
      "total_reported_model_tokens": 34981,
      "estimated_api_cost_usd": 0.223716,
      "host_wall_duration_ms": 10039
    }
  ],
  "guided_minus_baseline_tokens": 364,
  "reported_token_increase_percent": 1.051506485253,
  "cost_basis": "host_reported_list_estimate_not_cash_billing",
  "cash_billing_usd": null,
  "human_effort_seconds": null,
  "shared_orchestration_resources": null,
  "results_path": "evals/public-work-benchmark/RESULTS.json",
  "limitations": [
    "One actual public code-reasoning task and one baseline-then-guided pair; no measured quality gain.",
    "Guidance used slightly more reported tokens. No savings, causal speed improvement or efficiency benefit is established.",
    "Host classifier and main-model entries are included once; duplicate top-level usage/iterations and thinking-token subsets are not added again.",
    "Provider-list cost estimates are not cash billing. Shared coding-agent orchestration, other parent/worker/judge/retry resources and human effort are unknown.",
    "Full installed skill, host workflow, unaided human judgment, learning transfer and candidate/hiring validity were not evaluated.",
    "Public source/rubric contamination is possible. Host configuration compliance cannot be independently established from prompt hashes alone.",
    "No counterbalanced replication or preliminary five-pair improvement gate; no uncertainty or population percentile is claimed."
  ]
} as const;
export const PUBLIC_RESULTS_SHA256 = "00e678ab356b229828659530fe1bde39a0d18b372cc57a9a682d488263a87ca2" as const;
