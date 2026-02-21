from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate benchmark model config")
    parser.add_argument("--config", required=True)
    args = parser.parse_args()

    path = Path(args.config)
    data = json.loads(path.read_text())
    models = data.get("agentModels", {}) if isinstance(data, dict) else {}

    errors: list[str] = []
    for agent, cfg in models.items():
        if not isinstance(cfg, dict):
            errors.append(f"{agent}: config must be object")
            continue
        model = cfg.get("model")
        if not isinstance(model, str) or not model.strip():
            errors.append(f"{agent}: missing model string")
            continue
        if "/" not in model:
            errors.append(f"{agent}: invalid model id '{model}'")
        valid_prefixes = (
            "openrouter/",
            "opencode/",
            "github-copilot/",
            "openai/",
            "minimax-coding-plan/",
            "kimi-for-coding/",
            "zai-coding-plan/",
        )
        if not model.startswith(valid_prefixes):
            errors.append(f"{agent}: unsupported model namespace in '{model}'")

    if errors:
        for err in errors:
            print(f"ERROR: {err}")
        raise SystemExit(1)

    print(f"Model config valid: {path}")


if __name__ == "__main__":
    main()
