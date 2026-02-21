from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_config(config_path: Path) -> dict[str, Any]:
    data = json.loads(config_path.read_text())
    plugin = data.get("plugin", {}).get("swe-sworm", {}) if isinstance(data, dict) else {}
    return {
        "benchmarkProfile": plugin.get("benchmarkProfile"),
        "agentModels": plugin.get("agentModels", {}),
    }


def enrich_prediction(pred: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    if "benchmark_profile" not in pred and config.get("benchmarkProfile"):
        pred["benchmark_profile"] = config["benchmarkProfile"]
    if "agent_models" not in pred and config.get("agentModels"):
        pred["agent_models"] = config["agentModels"]
    return pred


def main() -> None:
    root = Path(__file__).resolve().parents[4]
    config_path = root / ".opencode" / "swe-sworm.json"
    if not config_path.exists():
        raise SystemExit(f"Missing config: {config_path}")

    config = load_config(config_path)
    if not config.get("benchmarkProfile") and not config.get("agentModels"):
        print("No benchmark profile or agent models configured. Nothing to inject.")
        return

    predictions_path = root / "benchmark" / "swe-rebench" / "predictions" / "predictions.jsonl"
    if not predictions_path.exists():
        raise SystemExit(f"Missing predictions file: {predictions_path}")

    lines = predictions_path.read_text().splitlines()
    enriched = []
    for line in lines:
        if not line.strip():
            continue
        pred = json.loads(line)
        if not isinstance(pred, dict):
            raise SystemExit("Predictions must be JSON objects per line")
        enriched.append(json.dumps(enrich_prediction(pred, config)))

    predictions_path.write_text("\n".join(enriched) + ("\n" if enriched else ""))
    print(f"Injected benchmark metadata into {predictions_path}")


if __name__ == "__main__":
    main()
