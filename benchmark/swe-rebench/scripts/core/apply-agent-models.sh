#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: bash benchmark/swe-rebench/scripts/core/apply-agent-models.sh <rich|poor>"
  exit 1
fi

PROFILE="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
CONFIG_PATH="$ROOT_DIR/benchmark/swe-rebench/configs/${PROFILE}.json"
TARGET="$ROOT_DIR/.opencode/swe-sworm.json"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "Config not found: $CONFIG_PATH"
  exit 1
fi

if [ ! -f "$TARGET" ]; then
  echo "Plugin config not found: $TARGET"
  exit 1
fi

python3 - <<PY
import json
from pathlib import Path

root = Path("$ROOT_DIR")
profile = "$PROFILE"
config_path = root / "benchmark" / "swe-rebench" / "configs" / f"{profile}.json"
target = root / ".opencode" / "swe-sworm.json"

profile_config = json.loads(config_path.read_text())
config = json.loads(target.read_text())

plugin = config.get("plugin", {}).get("swe-sworm") or {}

# Copy all config fields from profile
fields_to_copy = [
    "mode",
    "tools",
    "context",
    "planFirst",
    "routing",
    "agentModels",
    "approval",
    "verification",
    "strictControl",
    "compatibility",
    "storage",
    "skills",
    "secondOpinion"
]

for field in fields_to_copy:
    if field in profile_config:
        plugin[field] = profile_config[field]

# Always set benchmarkProfile
plugin["benchmarkProfile"] = profile

config.setdefault("plugin", {})["swe-sworm"] = plugin

target.write_text(json.dumps(config, indent=2))
print(f"Applied {profile} configuration to {target}")
PY
