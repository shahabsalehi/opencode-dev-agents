from __future__ import annotations

import argparse
import json
from pathlib import Path

from datasets import load_dataset


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare local SWE-rebench instance manifest")
    parser.add_argument("--output", required=True)
    parser.add_argument("--split", default="test")
    parser.add_argument("--count", type=int, default=0)
    args = parser.parse_args()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    dataset = load_dataset("nebius/SWE-rebench-leaderboard", split=args.split)
    limit = args.count if args.count and args.count > 0 else len(dataset)

    rows = []
    for i in range(min(limit, len(dataset))):
        item = dataset[i]
        rows.append(
            {
                "instance_id": item["instance_id"],
                "repo": item["repo"],
                "base_commit": item["base_commit"],
                "problem_statement": item["problem_statement"],
            }
        )

    output.write_text("\n".join(json.dumps(row) for row in rows) + "\n")
    print(f"Wrote {len(rows)} instances to {output}")


if __name__ == "__main__":
    main()
