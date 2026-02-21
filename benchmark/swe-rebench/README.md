# SWE-rebench Benchmark Harness

Production-ready benchmark harness for evaluating AI agents on SWE-bench tasks with adaptive timeouts, full caching, and automated reporting.

## Quick Start

```bash
cd benchmark/swe-rebench

# Run full benchmark with adaptive timeouts
bash scripts/run-master-benchmark.sh poor.json 0

# Run first 100 instances
bash scripts/run-master-benchmark.sh poor.json 100
```

## Directory Structure

```
swe-rebench/
├── scripts/
│   ├── run-master-benchmark.sh    # ⭐ Main entry point
│   ├── core/                      # Core scripts (internal)
│   ├── utils/                     # Analysis utilities
│   ├── archive/                   # Old scripts
│   └── README.md                  # Scripts documentation
├── configs/
│   ├── poor.json                  # Budget models
│   └── rich.json                  # Premium models
├── docs/                          # Documentation
│   ├── IMPROVEMENT_PLAN.md
│   ├── COMPLETE_RESEARCH_SUMMARY.md
│   └── MASTER_SCRIPT_README.md
├── instances/                     # Instance manifests
├── predictions/                   # Generated predictions
├── results/                       # Benchmark results
└── README.md                      # This file
```

## Features

- **Adaptive Timeouts**: Automatically escalates 180s → 600s → 1200s
- **Smart Caching**: No redownloads, sandbox cache pre-warmed
- **Progress Tracking**: Resumes interrupted runs
- **Comprehensive Reporting**: JSON summaries and detailed logs

## Usage

### 1. Configure

Edit `configs/poor.json` or create your own:

```json
{
  "agentModels": {
    "main-orchestrator": { "model": "minimax-coding-plan/MiniMax-M2.5" },
    "bug-hunter": { "model": "deepseek/deepseek-chat" }
  }
}
```

### 2. Run Benchmark

```bash
bash scripts/run-master-benchmark.sh [config] [count]
```

Examples:
```bash
# All instances
bash scripts/run-master-benchmark.sh poor.json 0

# First 50 instances
bash scripts/run-master-benchmark.sh poor.json 50

# Custom config
bash scripts/run-master-benchmark.sh my-config.json 100
```

### 3. View Results

```bash
# Summary
cat results/summary-*.json | python3 -m json.tool

# Logs
tail -f results/master-*.log

# Analysis
python3 scripts/utils/analyze-failures.py --results-dir results --run-prefix master-*
```

## Configuration

### Timeout Settings

Edit `scripts/run-master-benchmark.sh`:

```bash
TIMEOUT_INITIAL=180   # First attempt: 3 minutes
TIMEOUT_MEDIUM=600    # Second attempt: 10 minutes
TIMEOUT_MAX=1200      # Final attempt: 20 minutes
```

### Cache Settings

```bash
export SWARM_BENCH_CACHE_LEVEL=instance
export SWARM_BENCH_REUSE_WORKSPACE=1
export SWARM_BENCH_OFFLINE=1
```

## Documentation

- **Scripts**: `scripts/README.md`
- **Master Script**: `docs/MASTER_SCRIPT_README.md`
- **Research**: `docs/COMPLETE_RESEARCH_SUMMARY.md`
- **Improvements**: `docs/IMPROVEMENT_PLAN.md`

## Performance

Based on our testing:

| Config | Resolve Rate | Avg Time |
|--------|--------------|----------|
| poor.json (180s only) | 32.6% | ~3 min/instance |
| poor.json (adaptive) | 41.3% | ~5 min/instance |
| With model upgrades | 55-65% | ~5 min/instance |

## Requirements

- Docker available
- >=120GB free disk space
- OpenCode auth: `~/.local/share/opencode/auth.json`
- OpenRouter API key (optional)

## Troubleshooting

### Resume Interrupted Run

```bash
# Automatically resumes where it left off
bash scripts/run-master-benchmark.sh poor.json 0
```

### Clean Old Results

```bash
cd results && ls -t | tail -n +6 | xargs rm -rf
```

### Check Latest Log

```bash
ls -t results/*.log | head -1 | xargs tail -f
```

## Support

For issues:
1. Check logs in `results/`
2. Review timeout history in `results/*-timeouts.json`
3. See detailed docs in `docs/`

## License

See main project license.
