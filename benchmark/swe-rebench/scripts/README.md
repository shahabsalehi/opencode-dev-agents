# SWE-rebench Scripts Organization

This directory contains organized scripts for running SWE-bench benchmarks.

## Directory Structure

```
scripts/
├── core/                    # Core benchmark scripts (required)
│   ├── apply-agent-models.sh
│   ├── bootstrap.sh
│   ├── cache-manager.py
│   ├── enrich-predictions.py
│   ├── generate-pilot-predictions.py
│   ├── prepare-instance-manifest.py
│   ├── report-cache.py
│   └── run-predictions.sh
├── utils/                   # Utility scripts (analysis, reporting)
│   ├── analyze-failures.py
│   ├── summarize-benchmark.py
│   └── validate-model-config.py
├── run-master-benchmark.sh  # ⭐ MAIN ENTRY POINT
└── README.md               # This file
```

## Quick Start

### Run Full Benchmark

```bash
# Run all instances with adaptive timeouts
cd benchmark/swe-rebench
bash scripts/run-master-benchmark.sh poor.json 0

# Run first 100 instances
bash scripts/run-master-benchmark.sh poor.json 100
```

### Edit Configuration

Edit `configs/poor.json` or create your own:

```bash
vim configs/poor.json
```

### View Results

```bash
# Summary
cat results/summary-*.json | python3 -m json.tool

# Logs
tail -f results/master-*.log

# Analysis
python3 scripts/utils/analyze-failures.py --results-dir results --run-prefix master-*
```

## Core Scripts

### `run-master-benchmark.sh` (Main Entry Point)

**Purpose**: Production-ready benchmark runner with adaptive timeouts

**Features**:
- Adaptive timeouts (180s → 600s → 1200s)
- Full caching (no redownloads)
- Progress tracking
- Automatic retry
- Comprehensive reporting

**Usage**:
```bash
bash scripts/run-master-benchmark.sh [config-file] [instance-count]
```

### Core Scripts (in `core/`)

These are called by the master script:

- **`generate-pilot-predictions.py`**: Generates model predictions
- **`apply-agent-models.sh`**: Applies configuration to plugin
- **`enrich-predictions.py`**: Enriches predictions with metadata
- **`run-predictions.sh`**: Runs evaluation harness
- **`prepare-instance-manifest.py`**: Prepares instance list
- **`bootstrap.sh`**: Initial setup

### Utility Scripts (in `utils/`)

- **`analyze-failures.py`**: Analyzes failed instances
- **`summarize-benchmark.py`**: Generates summary reports
- **`validate-model-config.py`**: Validates configuration

## Configuration

### Config Files

Located in `configs/`:

- `poor.json` - Budget/cost-effective models
- `rich.json` - High-performance models

### Timeout Configuration

Edit `run-master-benchmark.sh`:

```bash
TIMEOUT_INITIAL=180   # First attempt (3 minutes)
TIMEOUT_MEDIUM=600    # Second attempt (10 minutes)
TIMEOUT_MAX=1200      # Final attempt (20 minutes)
```

## Workflow

1. **Configure**: Edit `configs/poor.json`
2. **Run**: Execute `run-master-benchmark.sh`
3. **Monitor**: Check logs in `results/`
4. **Analyze**: Use utility scripts
5. **Iterate**: Update config, re-run

## Archive

Old scripts are stored in `archive/` for reference:

- `run-benchmark.sh` - Original simple runner
- `run-full-benchmark*.sh` - Various full benchmark attempts
- `retry-*.sh` - Retry scripts (now integrated into master)

## Troubleshooting

### Check Logs

```bash
# Latest log
ls -t results/*.log | head -1 | xargs tail -f

# Specific run
ls -t results/master-*.log | head -1 | xargs tail -100
```

### Resume Interrupted Run

The master script automatically resumes. Just re-run:

```bash
bash scripts/run-master-benchmark.sh poor.json 0
```

### Clean Old Results

```bash
# Keep only last 5 runs
cd results && ls -t | tail -n +6 | xargs rm -rf
```

## Performance Tips

1. **Warm caches** before first run
2. **Use adaptive timeouts** (enabled by default)
3. **Skip resolved instances** (automatic)
4. **Monitor progress** every 10 instances

## Support

For issues:
1. Check logs in `results/`
2. Review timeout history in `results/*-timeouts.json`
3. See `MASTER_SCRIPT_README.md` for detailed docs
