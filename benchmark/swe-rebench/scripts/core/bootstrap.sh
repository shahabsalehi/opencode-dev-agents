#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
WORK_DIR="$ROOT_DIR/benchmark/swe-rebench"
HARNESS_DIR="$WORK_DIR/SWE-bench-fork"

mkdir -p "$WORK_DIR/results" "$WORK_DIR/predictions"

if [ ! -d "$HARNESS_DIR" ]; then
  git clone https://github.com/SWE-rebench/SWE-bench-fork "$HARNESS_DIR"
fi

python3 -m venv "$WORK_DIR/.venv"
source "$WORK_DIR/.venv/bin/activate"
pip install --upgrade pip
pip install -e "$HARNESS_DIR"

echo "Bootstrap complete. Activate with: source $WORK_DIR/.venv/bin/activate"
