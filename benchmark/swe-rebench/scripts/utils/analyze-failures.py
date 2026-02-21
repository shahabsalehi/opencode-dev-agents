from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def classify_failure(run: dict[str, Any]) -> list[str]:
    tags: list[str] = []
    if run.get("empty_patch", 0) > 0:
        tags.append("empty_patch")
    if run.get("resolved", 0) == 0 and run.get("unresolved", 0) > 0:
        tags.append("partial_or_wrong_fix")
    stderr = str(run.get("run_stderr", ""))
    if "Timeout" in stderr or "timeout" in stderr:
        tags.append("timeout")
    return tags


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze benchmark failures from archived artifacts")
    parser.add_argument("--results-dir", required=True)
    parser.add_argument("--run-prefix", required=True)
    args = parser.parse_args()

    results_dir = Path(args.results_dir)
    run_dirs = sorted([p for p in results_dir.iterdir() if p.is_dir() and p.name.startswith(args.run_prefix)])

    rows = []
    for run_dir in run_dirs:
        report = run_dir / "report.json"
        preds = run_dir / "predictions.jsonl"
        if not report.exists() or not preds.exists():
            continue

        report_data = json.loads(report.read_text())
        pred_lines = [line for line in preds.read_text().splitlines() if line.strip()]
        pred = json.loads(pred_lines[0]) if pred_lines else {}
        run = {
            "run_id": run_dir.name,
            "instance_id": pred.get("instance_id"),
            "submitted": int(report_data.get("submitted_instances", 0)),
            "resolved": int(report_data.get("resolved_instances", 0)),
            "unresolved": int(report_data.get("unresolved_instances", 0)),
            "empty_patch": int(report_data.get("empty_patch_instances", 0)),
            "run_stderr": pred.get("run_stderr", ""),
        }
        run["failure_tags"] = classify_failure(run)
        rows.append(run)

    out = {
        "run_prefix": args.run_prefix,
        "runs": rows,
    }
    output = results_dir / f"failure-analysis-{args.run_prefix}.json"
    output.write_text(json.dumps(out, indent=2))
    print(f"Failure analysis written to {output}")


if __name__ == "__main__":
    main()
