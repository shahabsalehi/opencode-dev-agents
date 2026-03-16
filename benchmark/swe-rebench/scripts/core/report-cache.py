#!/usr/bin/env python3
"""Generate JSON reports from benchmark cache for external dashboard."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any
from datetime import datetime


ROOT = Path(__file__).resolve().parents[4]
WORK_DIR = ROOT / "benchmark" / "swe-rebench"
CACHE_DIR = WORK_DIR / "cache" / "predictions"
CACHE_INDEX_PATH = WORK_DIR / "cache" / "cache-index.json"

import importlib.util
_cache_manager_path = Path(__file__).parent / "cache-manager.py"
_cache_manager_spec = importlib.util.spec_from_file_location("cache_manager", str(_cache_manager_path))
if _cache_manager_spec and _cache_manager_spec.loader:
    cache_manager = importlib.util.module_from_spec(_cache_manager_spec)
    _cache_manager_spec.loader.exec_module(cache_manager)
    load_cache_index = cache_manager.load_cache_index
else:
    raise ImportError("Failed to load cache-manager module")


def load_all_cached_results(index: dict[str, Any]) -> list[dict[str, Any]]:
    """Load all cached result files referenced in index."""
    results = []
    for instance_id, entry in index.get("instances", {}).items():
        cache_file = WORK_DIR / entry.get("cache_file", "")
        if cache_file.exists():
            try:
                data = json.loads(cache_file.read_text())
                result_data = data.get("result", data)
                result_data["instance_id"] = instance_id
                result_data["validation_status"] = entry.get("validation_status", "unknown")
                results.append(result_data)
            except (json.JSONDecodeError, IOError):
                continue
    return results


def compute_aggregates(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute aggregate statistics."""
    if not results:
        return {}
    
    total = len(results)
    resolved = sum(1 for r in results if r.get("status") == "resolved")
    unresolved = sum(1 for r in results if r.get("status") == "unresolved")
    timed_out = sum(1 for r in results if r.get("status") == "timed_out")
    valid_cache = sum(1 for r in results if r.get("validation_status") == "valid")
    needs_refresh = sum(1 for r in results if r.get("validation_status") == "needs_refresh")
    
    durations = [r.get("duration_seconds", 0) for r in results if r.get("duration_seconds")]
    costs = [r.get("estimated_cost_usd", 0) for r in results if r.get("estimated_cost_usd")]
    
    return {
        "total_instances": total,
        "resolved": resolved,
        "unresolved": unresolved,
        "timed_out": timed_out,
        "valid_cache": valid_cache,
        "needs_refresh": needs_refresh,
        "resolve_rate": round(resolved / total * 100, 2) if total > 0 else 0,
        "avg_duration_seconds": round(sum(durations) / len(durations), 2) if durations else 0,
        "total_estimated_cost_usd": round(sum(costs), 4) if costs else 0,
        "avg_cost_per_instance": round(sum(costs) / len(costs), 4) if costs else 0,
        "avg_cost_per_resolution": round(sum(costs) / resolved, 4) if resolved > 0 else 0,
    }


def aggregate_by_profile(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate results by profile."""
    by_profile: dict[str, list[dict[str, Any]]] = {}
    
    for result in results:
        profile = result.get("benchmark_profile", "unknown")
        if profile not in by_profile:
            by_profile[profile] = []
        by_profile[profile].append(result)
    
    aggregates = {}
    for profile, profile_results in by_profile.items():
        resolved = sum(1 for r in profile_results if r.get("status") == "resolved")
        costs = [r.get("estimated_cost_usd", 0) for r in profile_results if r.get("estimated_cost_usd")]
        durations = [r.get("duration_seconds", 0) for r in profile_results if r.get("duration_seconds")]
        
        aggregates[profile] = {
            "count": len(profile_results),
            "resolved": resolved,
            "unresolved": sum(1 for r in profile_results if r.get("status") == "unresolved"),
            "timed_out": sum(1 for r in profile_results if r.get("status") == "timed_out"),
            "resolve_rate": round(resolved / len(profile_results) * 100, 2) if profile_results else 0,
            "avg_cost_usd": round(sum(costs) / len(costs), 4) if costs else 0,
            "avg_duration_seconds": round(sum(durations) / len(durations), 2) if durations else 0,
        }
    
    return aggregates


def aggregate_by_model(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate results by model."""
    by_model: dict[str, list[dict[str, Any]]] = {}
    
    for result in results:
        model = result.get("model_name_or_path", "unknown")
        if model not in by_model:
            by_model[model] = []
        by_model[model].append(result)
    
    aggregates = {}
    for model, model_results in by_model.items():
        resolved = sum(1 for r in model_results if r.get("status") == "resolved")
        costs = [r.get("estimated_cost_usd", 0) for r in model_results if r.get("estimated_cost_usd")]
        
        aggregates[model] = {
            "count": len(model_results),
            "resolved": resolved,
            "resolve_rate": round(resolved / len(model_results) * 100, 2) if model_results else 0,
            "avg_cost_usd": round(sum(costs) / len(costs), 4) if costs else 0,
        }
    
    return aggregates


def get_needs_refresh_list(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Get list of instances that need refresh."""
    needs_refresh = []
    for result in results:
        if result.get("validation_status") == "needs_refresh":
            needs_refresh.append({
                "instance_id": result.get("instance_id"),
                "reason": result.get("needs_refresh_reason", "unknown"),
                "previous_status": result.get("status", "unknown"),
            })
    return needs_refresh


def generate_report() -> dict[str, Any]:
    """Generate complete cache report."""
    index = load_cache_index()
    results = load_all_cached_results(index)
    
    report = {
        "report_generated": datetime.now().isoformat(),
        "evaluation_commit": index.get("evaluation_commit", "unknown"),
        "cache_index_version": index.get("index_version", "unknown"),
        "summary": compute_aggregates(results),
        "by_profile": aggregate_by_profile(results),
        "by_model": aggregate_by_model(results),
        "needs_refresh": get_needs_refresh_list(results),
        "instances": [
            {
                "instance_id": r.get("instance_id"),
                "status": r.get("status"),
                "profile": r.get("benchmark_profile"),
                "model": r.get("model_name_or_path"),
                "duration_seconds": r.get("duration_seconds"),
                "estimated_cost_usd": r.get("estimated_cost_usd"),
                "validation_status": r.get("validation_status"),
            }
            for r in results
        ],
    }
    
    return report


def main() -> None:
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate cache report")
    parser.add_argument("--output", "-o", help="Output file (default: stdout)")
    parser.add_argument("--summary", action="store_true", help="Show only summary")
    
    args = parser.parse_args()
    
    report = generate_report()
    
    if args.summary:
        summary = {
            "report_generated": report["report_generated"],
            "evaluation_commit": report["evaluation_commit"],
            "summary": report["summary"],
            "by_profile": report["by_profile"],
            "needs_refresh_count": len(report["needs_refresh"]),
        }
        output = json.dumps(summary, indent=2)
    else:
        output = json.dumps(report, indent=2)
    
    if args.output:
        Path(args.output).write_text(output)
        print(f"Report written to {args.output}")
    else:
        print(output)


if __name__ == "__main__":
    main()
