#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: bash benchmark/swe-rebench/scripts/core/run-predictions.sh <predictions.jsonl> <run-id> [instance-id ...]"
  exit 1
fi

PREDICTIONS_PATH="$1"
RUN_ID="$2"
shift 2

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
WORK_DIR="$ROOT_DIR/benchmark/swe-rebench"
HARNESS_DIR="$WORK_DIR/SWE-bench-fork"
CACHE_LEVEL="${SWARM_BENCH_CACHE_LEVEL:-instance}"
MAX_WORKERS="${SWARM_BENCH_EVAL_WORKERS:-2}"
EVAL_TIMEOUT="${SWARM_BENCH_EVAL_TIMEOUT:-1800}"

if [ ! -d "$HARNESS_DIR" ]; then
  echo "Harness not found. Run bootstrap first: bash benchmark/swe-rebench/scripts/bootstrap.sh"
  exit 1
fi

if [ ! -f "$PREDICTIONS_PATH" ]; then
  echo "Predictions file not found: $PREDICTIONS_PATH"
  exit 1
fi

source "$WORK_DIR/.venv/bin/activate"
cd "$HARNESS_DIR"

INSTANCE_ARGS=()
if [ "$#" -gt 0 ]; then
  INSTANCE_ARGS=(--instance_ids "$@")
fi

python -m swebench.harness.run_evaluation \
  --dataset_name nebius/SWE-rebench-leaderboard \
  --split test \
  --predictions_path "$PREDICTIONS_PATH" \
  --run_id "$RUN_ID" \
  --cache_level "$CACHE_LEVEL" \
  --namespace swerebench \
  --max_workers "$MAX_WORKERS" \
  --timeout "$EVAL_TIMEOUT" \
  --report_dir "$WORK_DIR/results" \
  "${INSTANCE_ARGS[@]}"
