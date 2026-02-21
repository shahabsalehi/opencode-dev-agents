# Benchmark Cache

This directory contains cached benchmark results for the SWE-rebench harness.

## Structure

- `predictions/` - Individual instance cache files (JSON)
- `cache-index.json` - Index of all cached instances with validation status

## Purpose

The cache system provides:

1. **Result Persistence** - Avoid re-running instances that haven't changed
2. **Smart Invalidation** - Only invalidate results affected by code changes
3. **Cost Tracking** - Estimated token usage and cost per instance
4. **External Visualization** - JSON format for dashboard integration

## Cache Invalidation

Cache entries are invalidated based on:

- **Global paths** - Changes to core files invalidate all cache
- **Component hashes** - Directory-level hashing (tools/, policy/, agents/)
- **Execution fingerprint** - Which components an instance actually used

## Files

- `cache-index.json` - Master index with validation status
- `predictions/*.json` - Individual instance results

## Usage

```bash
# Validate cache against current commit
python3 scripts/core/cache-manager.py --validate

# List stale instances
python3 scripts/core/cache-manager.py --stale

# Generate report
python3 scripts/core/report-cache.py --output report.json

# Clear all cache
python3 scripts/core/cache-manager.py --clear
```

## Cost Estimation

Token counts are estimated using character-based heuristics:
- ~4 characters per token (English text)
- Confidence range: 0.5x to 2x actual
- Costs calculated using model pricing from config

This is approximate and documented as such.
