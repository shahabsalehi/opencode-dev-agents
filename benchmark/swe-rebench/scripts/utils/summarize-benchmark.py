from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


def parse_stats_text(text: str) -> dict[str, Any]:
    def extract_money(label: str) -> float | None:
        m = re.search(rf"{re.escape(label)}\s+\$(\d+\.\d+)", text)
        return float(m.group(1)) if m else None

    def extract_tokens(label: str) -> int | None:
        m = re.search(rf"{re.escape(label)}\s+([\d\.]+)([KM]?)", text)
        if not m:
            return None
        value = float(m.group(1))
        suffix = m.group(2)
        if suffix == "K":
            return int(value * 1_000)
        if suffix == "M":
            return int(value * 1_000_000)
        return int(value)

    return {
        "total_cost_usd": extract_money("Total Cost"),
        "avg_tokens_per_session": extract_tokens("Avg Tokens/Session"),
        "input_tokens": extract_tokens("Input"),
        "output_tokens": extract_tokens("Output"),
    }


def load_report(report_path: Path) -> dict[str, Any]:
    data = json.loads(report_path.read_text())
    return {
        "submitted": int(data.get("submitted_instances", 0)),
        "completed": int(data.get("completed_instances", 0)),
        "resolved": int(data.get("resolved_instances", 0)),
        "unresolved": int(data.get("unresolved_instances", 0)),
        "empty_patch": int(data.get("empty_patch_instances", 0)),
        "error": int(data.get("error_instances", 0)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize benchmark run artifacts")
    parser.add_argument("--results-dir", required=True)
    parser.add_argument("--run-prefix", required=True)
    args = parser.parse_args()

    results_dir = Path(args.results_dir)
    run_prefix = args.run_prefix

    run_dirs = sorted([p for p in results_dir.iterdir() if p.is_dir() and p.name.startswith(run_prefix)])
    aggregate = {
        "run_prefix": run_prefix,
        "runs": [],
        "totals": {
            "runs": 0,
            "submitted": 0,
            "completed": 0,
            "resolved": 0,
            "unresolved": 0,
            "empty_patch": 0,
            "error": 0,
            "cost_usd": 0.0,
            "instances_with_cost": 0,
        },
    }

    for run_dir in run_dirs:
        report_path = run_dir / "report.json"
        stats_path = run_dir / "opencode-stats.txt"
        if not report_path.exists():
            continue

        report = load_report(report_path)
        stats = parse_stats_text(stats_path.read_text()) if stats_path.exists() else {}
        run_row = {
            "run_id": run_dir.name,
            **report,
            **stats,
        }
        aggregate["runs"].append(run_row)

        totals = aggregate["totals"]
        totals["runs"] += 1
        totals["submitted"] += report["submitted"]
        totals["completed"] += report["completed"]
        totals["resolved"] += report["resolved"]
        totals["unresolved"] += report["unresolved"]
        totals["empty_patch"] += report["empty_patch"]
        totals["error"] += report["error"]
        if isinstance(stats.get("total_cost_usd"), float):
            totals["cost_usd"] += float(stats["total_cost_usd"])
            totals["instances_with_cost"] += 1

    totals = aggregate["totals"]
    totals["resolve_rate"] = round(
        (totals["resolved"] / totals["submitted"] * 100) if totals["submitted"] > 0 else 0.0,
        2,
    )
    totals["avg_cost_usd"] = round(
        (totals["cost_usd"] / totals["instances_with_cost"]) if totals["instances_with_cost"] > 0 else 0.0,
        6,
    )

    output_path = results_dir / f"summary-{run_prefix}.json"
    output_path.write_text(json.dumps(aggregate, indent=2))
    print(f"Summary written to {output_path}")


if __name__ == "__main__":
    main()
