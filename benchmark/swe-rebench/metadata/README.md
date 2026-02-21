# Benchmark Metadata

This directory defines the prediction metadata schema and cost estimation rules.

## Predictions Metadata Schema

Each prediction in `predictions.jsonl` may include the following fields:

```json
{
  "instance_id": "biopython__biopython-5005",
  "model_name_or_path": "openrouter/anthropic/claude-3.5-sonnet",
  "model_patch": "diff --git ...",
  "model_provider": "openrouter",
  "agent_name": "main-orchestrator",
  "agent_version": "1.0.0",
  "benchmark_profile": "rich",
  "run_id": "run-2026-02-15",
  "run_timestamp": "2026-02-15T18:00:00Z",
  "input_tokens": 12345,
  "output_tokens": 6789,
  "total_tokens": 19134,
  "cost_usd": 0.1234,
  "latency_seconds": 12.3,
  "generation_params": {
    "temperature": 0.2,
    "top_p": 0.95
  }
}
```

Only `instance_id`, `model_name_or_path`, and `model_patch` are required by the harness.
All other fields are optional but will be preserved in reports if present.

## Cost Estimation

We compute cost using OpenRouter pricing for the model used. This allows
apples-to-apples comparisons across providers without relying on provider-specific billing.

If `cost_usd` is already present in predictions, the harness will use it as-is.
Otherwise, it will compute cost from token counts and the model price table.
