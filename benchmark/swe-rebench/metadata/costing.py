from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class PriceEntry:
    input_usd_per_1m: float | None
    output_usd_per_1m: float | None


def load_price_table(path: Path) -> dict[str, PriceEntry]:
    data = json.loads(path.read_text())
    models = data.get("models", {}) if isinstance(data, dict) else {}
    table: dict[str, PriceEntry] = {}
    for model_name, value in models.items():
        if not isinstance(value, dict):
            continue
        table[model_name] = PriceEntry(
            input_usd_per_1m=value.get("input_usd_per_1m"),
            output_usd_per_1m=value.get("output_usd_per_1m"),
        )
    return table


def compute_cost_usd(
    model_name: str,
    input_tokens: int | None,
    output_tokens: int | None,
    pricing: dict[str, PriceEntry],
) -> float | None:
    if input_tokens is None and output_tokens is None:
        return None
    entry = pricing.get(model_name)
    if entry is None:
        return None
    if entry.input_usd_per_1m is None and entry.output_usd_per_1m is None:
        return None

    cost = 0.0
    if input_tokens is not None and entry.input_usd_per_1m is not None:
        cost += (input_tokens / 1_000_000) * entry.input_usd_per_1m
    if output_tokens is not None and entry.output_usd_per_1m is not None:
        cost += (output_tokens / 1_000_000) * entry.output_usd_per_1m
    return round(cost, 6)


def normalize_prediction_metrics(prediction: dict[str, Any], pricing: dict[str, PriceEntry]) -> dict[str, Any]:
    if "cost_usd" in prediction and prediction["cost_usd"] is not None:
        return prediction

    model_name = prediction.get("model_name_or_path")
    if not isinstance(model_name, str):
        return prediction

    input_tokens = prediction.get("input_tokens")
    output_tokens = prediction.get("output_tokens")

    if not isinstance(input_tokens, int) and input_tokens is not None:
        input_tokens = None
    if not isinstance(output_tokens, int) and output_tokens is not None:
        output_tokens = None

    cost = compute_cost_usd(model_name, input_tokens, output_tokens, pricing)
    if cost is not None:
        prediction["cost_usd"] = cost
    return prediction
