#!/usr/bin/env bash
# Master benchmark runner with adaptive timeouts, smart caching, and auto-refresh
# Usage: ./run-master-benchmark.sh [config-file] [instance-count]
# Example: ./run-master-benchmark.sh poor.json 100

set -e

# Configuration
CONFIG_FILE="${1:-poor.json}"
INSTANCE_COUNT="${2:-0}"  # 0 = all instances
RUN_PREFIX="master-$(date +%Y%m%d-%H%M%S)"

# Paths - use script location to determine root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
WORK_DIR="$ROOT_DIR/benchmark/swe-rebench"
RESULTS_DIR="$WORK_DIR/results"
MANIFEST_PATH="$WORK_DIR/instances/leaderboard-test.jsonl"
LOG_FILE="$RESULTS_DIR/${RUN_PREFIX}.log"
TIMEOUT_DB="$RESULTS_DIR/${RUN_PREFIX}-timeouts.json"
PROGRESS_FILE="$RESULTS_DIR/${RUN_PREFIX}-progress.txt"

# Pin git commit at start to prevent mixing results across commits
EVAL_COMMIT=$(cd "$ROOT_DIR" && git rev-parse HEAD)
export SWARM_BENCH_EVAL_COMMIT="$EVAL_COMMIT"

# Timeout configuration (adaptive)
TIMEOUT_INITIAL="${SWARM_BENCH_TIMEOUT_INITIAL:-60}"
TIMEOUT_MEDIUM="${SWARM_BENCH_TIMEOUT_MEDIUM:-180}"
TIMEOUT_HIGH="${SWARM_BENCH_TIMEOUT_HIGH:-600}"
TIMEOUT_MAX="${SWARM_BENCH_TIMEOUT_MAX:-1200}"
PREFLIGHT_ENABLED="${SWARM_BENCH_PREFLIGHT_ENABLED:-1}"
PREFLIGHT_TIMEOUT="${SWARM_BENCH_PREFLIGHT_TIMEOUT:-90}"
PREFLIGHT_RETRIES="${SWARM_BENCH_PREFLIGHT_RETRIES:-2}"
PREFLIGHT_RETRY_SLEEP="${SWARM_BENCH_PREFLIGHT_RETRY_SLEEP:-5}"
PREFLIGHT_DIR="${SWARM_BENCH_PREFLIGHT_DIR:-/tmp}"

# Export cache settings
export SWARM_BENCH_CACHE_LEVEL="instance"
export SWARM_BENCH_EVAL_WORKERS="2"
export SWARM_BENCH_EVAL_TIMEOUT="3600"
export SWARM_BENCH_REUSE_WORKSPACE="1"
export SWARM_BENCH_SHARED_HOME="$WORK_DIR/.sandbox-home"
export SWARM_BENCH_HF_HOME="$WORK_DIR/.cache/hf"
export SWARM_BENCH_HF_DATASETS_CACHE="$SWARM_BENCH_HF_HOME/datasets"
export SWARM_BENCH_OFFLINE="1"
export HF_HOME="$SWARM_BENCH_HF_HOME"
export HF_DATASETS_CACHE="$SWARM_BENCH_HF_DATASETS_CACHE"
export HF_HUB_OFFLINE="1"
export HF_DATASETS_OFFLINE="1"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

resolve_preflight_model() {
    python3 - "$ROOT_DIR/.opencode/swe-sworm.json" << 'PY' 2>/dev/null || echo "opencode-go/glm-4.7"
import json
import sys
from pathlib import Path

cfg = Path(sys.argv[1])
if not cfg.exists():
    print("opencode-go/glm-4.7")
    raise SystemExit(0)

data = json.loads(cfg.read_text())
plugin = data.get("plugin", {}).get("swe-sworm", {}) if isinstance(data, dict) else {}
models = plugin.get("agentModels", {}) if isinstance(plugin, dict) else {}
main = models.get("main-orchestrator", {}) if isinstance(models, dict) else {}
model = main.get("model") if isinstance(main, dict) else None
print(model if isinstance(model, str) and model else "opencode-go/glm-4.7")
PY
}

run_preflight() {
    if [ "$PREFLIGHT_ENABLED" != "1" ]; then
        log "Preflight check skipped (SWARM_BENCH_PREFLIGHT_ENABLED=$PREFLIGHT_ENABLED)"
        return 0
    fi

    local preflight_model
    preflight_model="${SWARM_BENCH_PREFLIGHT_MODEL:-$(resolve_preflight_model)}"

    log "Running OpenCode preflight (model: $preflight_model, timeout: ${PREFLIGHT_TIMEOUT}s, retries: $PREFLIGHT_RETRIES, dir: $PREFLIGHT_DIR)"

    local attempt=1
    while [ "$attempt" -le "$PREFLIGHT_RETRIES" ]; do
        if timeout "$PREFLIGHT_TIMEOUT" opencode run --dir "$PREFLIGHT_DIR" --model "$preflight_model" "Reply with EXACTLY: OK" >/dev/null 2>&1 < /dev/null; then
            log "  ✓ Preflight passed"
            return 0
        else
            local exit_code=$?
            log "  ⚠ Preflight attempt ${attempt}/${PREFLIGHT_RETRIES} failed (exit: $exit_code)"

            if [ "$attempt" -lt "$PREFLIGHT_RETRIES" ]; then
                sleep "$PREFLIGHT_RETRY_SLEEP"
            fi
        fi
        attempt=$((attempt + 1))
    done

    log "  ✗ Preflight failed. Aborting benchmark run."
    log "  Set SWARM_BENCH_PREFLIGHT_ENABLED=0 to bypass (not recommended)."
    return 1
}

# Initialize
cd "$WORK_DIR"
mkdir -p "$RESULTS_DIR"
echo "{}" > "$TIMEOUT_DB"
echo "0" > "$PROGRESS_FILE"

log "========================================"
log "MASTER BENCHMARK RUNNER"
log "========================================"
log "Config: $CONFIG_FILE"
log "Instance count: $INSTANCE_COUNT (0=all)"
log "Run prefix: $RUN_PREFIX"
log "Evaluation commit: $EVAL_COMMIT"
log "Started: $(date)"
log ""

# Copy OpenCode cache to sandbox to avoid rebuilds
log "Setting up OpenCode cache..."
SANDBOX_HOME="$SWARM_BENCH_SHARED_HOME"
mkdir -p "$SANDBOX_HOME/.local/share/opencode"
mkdir -p "$SANDBOX_HOME/.cache/opencode"

# Copy pre-built cache from host
if [ -d "$HOME/.local/share/opencode" ]; then
    cp -r "$HOME/.local/share/opencode/"* "$SANDBOX_HOME/.local/share/opencode/" 2>/dev/null || true
    log "  ✓ Copied opencode data"
fi

if [ -d "$HOME/.cache/opencode" ]; then
    cp -r "$HOME/.cache/opencode/"* "$SANDBOX_HOME/.cache/opencode/" 2>/dev/null || true
    log "  ✓ Copied opencode cache"
fi

# Copy auth if exists
if [ -f "$HOME/.local/share/opencode/auth.json" ]; then
    cp "$HOME/.local/share/opencode/auth.json" "$SANDBOX_HOME/.local/share/opencode/"
    log "  ✓ Copied auth.json"
fi

# Apply config
log ""
log "Applying configuration..."
bash "$WORK_DIR/scripts/core/apply-agent-models.sh" "$(basename "$CONFIG_FILE" .json)"
log "  ✓ Config applied"

# Source virtual environment
source "$WORK_DIR/.venv/bin/activate"

log ""
if ! run_preflight; then
    exit 1
fi

# Validate cache and identify stale entries
log ""
log "Validating cache..."
python3 "$WORK_DIR/scripts/core/cache-manager.py" --validate --commit "$EVAL_COMMIT"
STALE_COUNT=$(python3 "$WORK_DIR/scripts/core/cache-manager.py" --stale 2>/dev/null | wc -l)
if [ "$STALE_COUNT" -gt 0 ]; then
    log "  Found $STALE_COUNT stale instances to refresh"
fi

# Get instance list
log ""
log "Loading instances..."
if [ "$INSTANCE_COUNT" -eq 0 ]; then
    # All instances
    python3 - "$MANIFEST_PATH" << 'PY' > /tmp/instances-to-run.txt
import json
import sys
with open(sys.argv[1]) as f:
    for line in f:
        if line.strip():
            print(json.loads(line)["instance_id"])
PY
else
    # Limited count
    python3 - "$MANIFEST_PATH" "$INSTANCE_COUNT" << 'PY' > /tmp/instances-to-run.txt
import json
import sys
count = int(sys.argv[2])
with open(sys.argv[1]) as f:
    for i, line in enumerate(f):
        if i >= count:
            break
        if line.strip():
            print(json.loads(line)["instance_id"])
PY
fi

TOTAL=$(wc -l < /tmp/instances-to-run.txt)
log "Total instances to process: $TOTAL"
log ""

# Function to get timeout for instance
get_timeout() {
    local instance_id="$1"
    python3 - "$TIMEOUT_DB" "$instance_id" "$TIMEOUT_INITIAL" << 'PY' 2>/dev/null || echo "$TIMEOUT_INITIAL"
import json
import sys
try:
    db = json.load(open(sys.argv[1]))
    print(db.get(sys.argv[2], int(sys.argv[3])))
except:
    print(int(sys.argv[3]))
PY
}

# Function to update timeout
update_timeout() {
    local instance_id="$1"
    local new_timeout="$2"
    python3 - "$TIMEOUT_DB" "$instance_id" "$new_timeout" << 'PY'
import json
import sys
try:
    with open(sys.argv[1], 'r') as f:
        db = json.load(f)
except:
    db = {}
db[sys.argv[2]] = int(sys.argv[3])
with open(sys.argv[1], 'w') as f:
    json.dump(db, f, indent=2)
PY
}

# Function to check if instance was already resolved
is_resolved() {
    local instance_id="$1"
    # Check in existing results
    for result_dir in "$RESULTS_DIR"/*/; do
        if [ -f "$result_dir/predictions.jsonl" ]; then
            if grep -q "$instance_id" "$result_dir/predictions.jsonl" 2>/dev/null; then
                # Check if resolved
                report_file="${result_dir}report.json"
                if [ -f "$report_file" ]; then
                    resolved=$(python3 -c "import json; d=json.load(open('$report_file')); print(d.get('resolved', False))" 2>/dev/null)
                    if [ "$resolved" = "True" ]; then
                        return 0
                    fi
                fi
            fi
        fi
    done
    return 1
}

# Main processing loop
index=1
resolved_count=0
unresolved_count=0
timeout_count=0
error_count=0

exec 3< /tmp/instances-to-run.txt
while IFS= read -r instance_id <&3; do
    # Check if already resolved
    if is_resolved "$instance_id"; then
        log "[$index/$TOTAL] $instance_id - Already resolved, skipping"
        resolved_count=$((resolved_count + 1))
        index=$((index + 1))
        echo "$((index - 1))" > "$PROGRESS_FILE"
        continue
    fi
    
    # Get adaptive timeout
    current_timeout=$(get_timeout "$instance_id")
    run_id="${RUN_PREFIX}-${index}"
    
    log "[$index/$TOTAL] Processing $instance_id (timeout: ${current_timeout}s)"
    
    export SWARM_BENCH_OPENCODE_TIMEOUT="$current_timeout"
    
    # Generate prediction
    prediction_success=false
    timeout_occurred=false
    
    if timeout "$((current_timeout + 30))" python3 "$WORK_DIR/scripts/core/generate-pilot-predictions.py" \
        --profile "$(basename "$CONFIG_FILE" .json)" \
        --instance-id "$instance_id" \
        --manifest-path "$MANIFEST_PATH" >> "$LOG_FILE" 2>&1 < /dev/null; then
        log "  ✓ Prediction generated"
        prediction_success=true

        prediction_timed_out=$(python3 - "$WORK_DIR/predictions/predictions.jsonl" << 'PY' 2>/dev/null || echo "false"
import json
import sys

path = sys.argv[1]
last = None
with open(path) as f:
    for line in f:
        line = line.strip()
        if line:
            last = json.loads(line)

stderr = (last or {}).get("run_stderr", "")
print(str(isinstance(stderr, str) and stderr.startswith("Timeout after")).lower())
PY
)

        if [ "$prediction_timed_out" = "true" ]; then
            log "  ⚠ Model timed out"
            prediction_success=false
            timeout_occurred=true
        fi
    else
        exit_code=$?
        if [ $exit_code -eq 124 ]; then
            log "  ⚠ Timeout occurred"
            timeout_occurred=true
        else
            log "  ✗ Prediction failed (exit: $exit_code)"
        fi
    fi
    
    # Handle timeout escalation
    if [ "$timeout_occurred" = true ]; then
        timeout_count=$((timeout_count + 1))
        
        if [ "$current_timeout" -eq "$TIMEOUT_INITIAL" ]; then
            update_timeout "$instance_id" "$TIMEOUT_MEDIUM"
            log "  → Will retry with ${TIMEOUT_MEDIUM}s next time"
        elif [ "$current_timeout" -eq "$TIMEOUT_MEDIUM" ]; then
            update_timeout "$instance_id" "$TIMEOUT_HIGH"
            log "  → Will retry with ${TIMEOUT_HIGH}s next time"
        elif [ "$current_timeout" -eq "$TIMEOUT_HIGH" ]; then
            update_timeout "$instance_id" "$TIMEOUT_MAX"
            log "  → Will retry with ${TIMEOUT_MAX}s next time"
        else
            log "  ⚠ Max timeout reached, marking as unresolved"
            unresolved_count=$((unresolved_count + 1))
        fi

        echo "$index" > "$PROGRESS_FILE"
        index=$((index + 1))
        continue
    fi
    
    # Process prediction if successful
    if [ "$prediction_success" = true ]; then
        # Enrich
        python3 "$WORK_DIR/scripts/core/enrich-predictions.py" >> "$LOG_FILE" 2>&1 < /dev/null || true
        
        # Evaluate
        if bash "$WORK_DIR/scripts/core/run-predictions.sh" "$WORK_DIR/predictions/predictions.jsonl" "$run_id" >> "$LOG_FILE" 2>&1 < /dev/null; then
            log "  ✓ Evaluation complete"
            
            # Check result
            report_file="$WORK_DIR/SWE-bench-fork/opencode-go__glm-4.7.${run_id}.json"
            if [ -f "$report_file" ]; then
                resolved=$(python3 -c "import json; d=json.load(open('$report_file')); print(d.get('resolved_instances', 0))" 2>/dev/null || echo "0")
                
                if [ "$resolved" -gt 0 ]; then
                    log "  🎉 RESOLVED!"
                    resolved_count=$((resolved_count + 1))
                else
                    log "  ⚠ Not resolved"
                    unresolved_count=$((unresolved_count + 1))
                fi
            else
                log "  ⚠ No report file"
                unresolved_count=$((unresolved_count + 1))
            fi
        else
            log "  ✗ Evaluation failed"
            error_count=$((error_count + 1))
        fi
    else
        unresolved_count=$((unresolved_count + 1))
    fi
    
    # Update progress
    echo "$index" > "$PROGRESS_FILE"
    
    # Progress report every 10 instances
    if [ $((index % 10)) -eq 0 ]; then
        log ""
        log "Progress Update:"
        log "  Processed: $index/$TOTAL"
        log "  Resolved: $resolved_count"
        log "  Unresolved: $unresolved_count"
        log "  Timeouts: $timeout_count"
        log "  Errors: $error_count"
        log "  Current rate: $(echo "scale=1; $resolved_count * 100 / $index" | bc 2>/dev/null || echo "N/A")%"
        log ""
    fi
    
    index=$((index + 1))
done
exec 3<&-

# Final summary
log ""
log "========================================"
log "BENCHMARK COMPLETE"
log "========================================"
log "Completed: $(date)"
log ""
log "FINAL RESULTS:"
log "  Total instances: $TOTAL"
log "  Resolved: $resolved_count"
log "  Unresolved: $unresolved_count"
log "  Timeouts: $timeout_count"
log "  Errors: $error_count"
log "  Resolve rate: $(echo "scale=1; $resolved_count * 100 / $TOTAL" | bc 2>/dev/null || echo "N/A")%"
log ""
log "Timeout distribution:"
python3 - "$TIMEOUT_DB" << 'PY'
import json
import sys
try:
    with open(sys.argv[1]) as f:
        db = json.load(f)
    
    initial = sum(1 for v in db.values() if v == 60)
    medium = sum(1 for v in db.values() if v == 180)
    high = sum(1 for v in db.values() if v == 600)
    max_timeout = sum(1 for v in db.values() if v == 1200)

    print(f"  60s (initial): {initial} instances")
    print(f"  180s (escalated): {medium} instances")
    print(f"  600s (high): {high} instances")
    print(f"  1200s (max): {max_timeout} instances")
except:
    print("  Could not analyze timeout distribution")
PY
log ""
log "Results saved to: $RESULTS_DIR"
log "Log file: $LOG_FILE"
log "Timeout DB: $TIMEOUT_DB"
log "========================================"

# Generate cache report for dashboard
log ""
log "Generating cache report..."
python3 "$WORK_DIR/scripts/core/report-cache.py" --output "$RESULTS_DIR/cache-report-${RUN_PREFIX}.json"
log "  ✓ Cache report saved"

# Generate final summary JSON
python3 - "$RESULTS_DIR" "$RUN_PREFIX" "$resolved_count" "$unresolved_count" "$timeout_count" "$error_count" "$TOTAL" << 'PY'
import json
import sys
from datetime import datetime

results = {
    "run_prefix": sys.argv[2],
    "timestamp": datetime.now().isoformat(),
    "config_file": sys.argv[8] if len(sys.argv) > 8 else "unknown",
    "totals": {
        "total": int(sys.argv[7]),
        "resolved": int(sys.argv[3]),
        "unresolved": int(sys.argv[4]),
        "timeouts": int(sys.argv[5]),
        "errors": int(sys.argv[6]),
        "resolve_rate": round(int(sys.argv[3]) * 100 / int(sys.argv[7]), 2) if int(sys.argv[7]) > 0 else 0
    }
}

output_file = f"{sys.argv[1]}/summary-{sys.argv[2]}.json"
with open(output_file, 'w') as f:
    json.dump(results, f, indent=2)

print(f"Summary written to: {output_file}")
PY
