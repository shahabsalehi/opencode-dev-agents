#!/usr/bin/env python3
"""Cache manager for benchmark predictions with smart invalidation."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[4]
WORK_DIR = ROOT / "benchmark" / "swe-rebench"
# Cache is stored in committed location for external visualization
CACHE_DIR = WORK_DIR / "cache" / "predictions"
CACHE_INDEX_PATH = WORK_DIR / "cache" / "cache-index.json"

# Paths that invalidate all cache when changed
GLOBAL_INVALIDATION_PATHS = [
    "src/index.ts",
    "src/create-hooks.ts", 
    "src/create-plugin-state.ts",
    "src/create-execution-hooks.ts",
    "src/create-governance-tools.ts",
    "package.json",
    "package-lock.json",
    "bun.lock",
    "tsconfig.json",
    "benchmark/swe-rebench/scripts/core/generate-pilot-predictions.py",
    "benchmark/swe-rebench/scripts/core/cache-manager.py",
]

COMPONENT_DIRECTORIES = {
    "tools_dir": "src/tools/",
    "policy_dir": "src/policy/",
    "agents_dir": ".opencode/agents/",
    "hooks_dir": "src/create-hooks.ts",
    "config_dir": ".opencode/swe-sworm.json",
}


def get_git_commit() -> str:
    """Get current git commit hash."""
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else "unknown"


def get_changed_files_since(commit: str) -> list[str]:
    """Get list of files changed since a commit."""
    result = subprocess.run(
        ["git", "diff", "--name-only", f"{commit}..HEAD"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.split("\n") if line.strip()]


def hash_file(filepath: Path) -> str:
    """Compute MD5 hash of a file."""
    if not filepath.exists():
        return ""
    content = filepath.read_bytes()
    return hashlib.md5(content).hexdigest()[:16]


def hash_directory(dirpath: Path, extensions: tuple[str, ...] = (".ts", ".js", ".json", ".md")) -> str:
    """Compute combined hash of all files in a directory."""
    if not dirpath.exists():
        return ""
    
    hashes = []
    for filepath in sorted(dirpath.rglob("*")):
        if filepath.is_file() and filepath.suffix in extensions:
            file_hash = hashlib.md5(filepath.read_bytes()).hexdigest()[:8]
            relative_path = filepath.relative_to(dirpath)
            hashes.append(f"{relative_path}:{file_hash}")
    
    combined = "|".join(hashes)
    return hashlib.md5(combined.encode()).hexdigest()[:16]


def compute_component_hashes() -> dict[str, str]:
    """Compute hashes for all component directories."""
    hashes = {}
    for component, relpath in COMPONENT_DIRECTORIES.items():
        full_path = ROOT / relpath
        if component == "config_dir":
            hashes[component] = hash_file(full_path)
        elif component == "hooks_dir":
            hashes[component] = hash_file(full_path)
        else:
            hashes[component] = hash_directory(full_path)
    return hashes


def check_global_invalidation(git_diff: list[str]) -> tuple[bool, list[str]]:
    """Check if any global invalidation paths changed."""
    matched = []
    for changed_file in git_diff:
        for global_path in GLOBAL_INVALIDATION_PATHS:
            if changed_file.startswith(global_path) or changed_file == global_path:
                matched.append(changed_file)
    return len(matched) > 0, matched


def component_used_by_instance(component: str, fingerprint: dict[str, Any]) -> bool:
    """Check if a component is used by an instance based on its fingerprint."""
    component_mapping = {
        "tools_dir": "tools_used",
        "policy_dir": "policies_applied", 
        "agents_dir": "agents_invoked",
        "hooks_dir": "hooks_triggered",
        "config_dir": None,  # Config always matters
    }
    
    fingerprint_key = component_mapping.get(component)
    if fingerprint_key is None:
        return True  # Config changes always invalidate
    
    return len(fingerprint.get(fingerprint_key, [])) > 0


def load_cache_index() -> dict[str, Any]:
    """Load cache index or create new one."""
    if CACHE_INDEX_PATH.exists():
        try:
            return json.loads(CACHE_INDEX_PATH.read_text())
        except (json.JSONDecodeError, IOError):
            pass
    
    return {
        "index_version": "2.0",
        "evaluation_commit": get_git_commit(),
        "last_updated": "",
        "component_hashes": {},
        "instances": {},
    }


def save_cache_index(index: dict[str, Any]) -> None:
    """Save cache index atomically."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = CACHE_INDEX_PATH.with_suffix(".tmp")
    temp_path.write_text(json.dumps(index, indent=2))
    temp_path.rename(CACHE_INDEX_PATH)


def validate_cache(commit: str | None = None) -> dict[str, Any]:
    """Validate cache and mark stale entries."""
    index = load_cache_index()
    current_commit = commit or get_git_commit()
    current_hashes = compute_component_hashes()
    
    # Check if we're evaluating a different commit
    if index.get("evaluation_commit") != current_commit:
        # Get changes between cached commit and current
        git_diff = get_changed_files_since(index["evaluation_commit"])
        
        # Check global invalidation first
        should_invalidate_all, global_matches = check_global_invalidation(git_diff)
        
        if should_invalidate_all:
            # Mark all as needs_refresh
            for instance_id, entry in index.get("instances", {}).items():
                entry["validation_status"] = "needs_refresh"
                entry["needs_refresh_reason"] = f"global_path_changed: {global_matches[0]}"
        else:
            # Check each instance
            for instance_id, entry in index.get("instances", {}).items():
                runtime_hashes = entry.get("component_hashes_at_runtime", {})
                fingerprint = entry.get("fingerprint", {})
                
                # Check if any relevant component changed
                needs_refresh = False
                refresh_reason = None
                
                for component, current_hash in current_hashes.items():
                    runtime_hash = runtime_hashes.get(component)
                    if runtime_hash != current_hash:
                        if component_used_by_instance(component, fingerprint):
                            needs_refresh = True
                            refresh_reason = f"{component}_changed"
                            break
                
                if needs_refresh:
                    entry["validation_status"] = "needs_refresh"
                    entry["needs_refresh_reason"] = refresh_reason
                else:
                    entry["validation_status"] = "valid"
                    entry["component_hashes_at_runtime"] = current_hashes.copy()
        
        index["evaluation_commit"] = current_commit
        index["component_hashes"] = {
            k: {"current": v, "last_commit": current_commit}
            for k, v in current_hashes.items()
        }
    
    index["last_updated"] = subprocess.run(
        ["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"],
        capture_output=True,
        text=True,
    ).stdout.strip()
    
    save_cache_index(index)
    return index


def get_instance_cache_path(instance_id: str, profile: str) -> Path:
    """Get path to instance cache file."""
    cache_key = hashlib.md5(f"{instance_id}:{profile}".encode()).hexdigest()[:16]
    return CACHE_DIR / f"{cache_key}.json"


def load_instance_cache(instance_id: str, profile: str) -> dict[str, Any] | None:
    """Load cached result for an instance if valid."""
    cache_path = get_instance_cache_path(instance_id, profile)
    if not cache_path.exists():
        return None
    
    try:
        return json.loads(cache_path.read_text())
    except (json.JSONDecodeError, IOError):
        return None


def save_instance_cache(
    instance_id: str,
    profile: str,
    result: dict[str, Any],
    fingerprint: dict[str, Any],
) -> None:
    """Save instance result to cache."""
    cache_path = get_instance_cache_path(instance_id, profile)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    
    # Enhance result with cache metadata
    cache_entry = {
        "cache_version": "2.0",
        "instance_id": instance_id,
        "execution_context": {
            "profile": profile,
            "evaluation_commit": get_git_commit(),
            "timestamp": subprocess.run(
                ["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"],
                capture_output=True,
                text=True,
            ).stdout.strip(),
            "component_hashes": compute_component_hashes(),
        },
        "fingerprint": fingerprint,
        "result": result,
    }
    
    temp_path = cache_path.with_suffix(".tmp")
    temp_path.write_text(json.dumps(cache_entry, indent=2))
    temp_path.rename(cache_path)

    # Update index with file locking to prevent TOCTOU race
    import fcntl
    index_path = CACHE_INDEX_PATH
    lock_path = index_path.with_suffix(".lock")

    with open(lock_path, "w") as lock_file:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        try:
            index = load_cache_index()
            index["instances"][instance_id] = {
                "cache_file": str(cache_path.relative_to(WORK_DIR)),
                "status": result.get("status", "unknown"),
                "validation_status": "valid",
                "needs_refresh_reason": None,
                "component_hashes_at_runtime": cache_entry["execution_context"]["component_hashes"],
                "fingerprint": fingerprint,
            }
            save_cache_index(index)
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def get_stale_instances(index: dict[str, Any] | None = None) -> list[str]:
    """Get list of instance IDs that need refresh."""
    if index is None:
        index = load_cache_index()
    
    stale = []
    for instance_id, entry in index.get("instances", {}).items():
        if entry.get("validation_status") == "needs_refresh":
            stale.append(instance_id)
    
    return stale


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Manage benchmark cache")
    parser.add_argument("--validate", action="store_true", help="Validate cache against current commit")
    parser.add_argument("--commit", help="Validate against specific commit")
    parser.add_argument("--stale", action="store_true", help="List stale instances")
    parser.add_argument("--clear", action="store_true", help="Clear all cache")
    
    args = parser.parse_args()
    
    if args.validate:
        index = validate_cache(args.commit)
        stale = get_stale_instances(index)
        print(f"Cache validated. {len(stale)} instances need refresh.")
        for instance_id in stale[:10]:  # Show first 10
            reason = index["instances"][instance_id].get("needs_refresh_reason", "unknown")
            print(f"  - {instance_id}: {reason}")
        if len(stale) > 10:
            print(f"  ... and {len(stale) - 10} more")
    
    elif args.stale:
        index = load_cache_index()
        stale = get_stale_instances(index)
        print(f"Stale instances ({len(stale)}):")
        for instance_id in stale:
            reason = index["instances"][instance_id].get("needs_refresh_reason", "unknown")
            print(f"  {instance_id}: {reason}")
    
    elif args.clear:
        import shutil
        if CACHE_DIR.exists():
            shutil.rmtree(CACHE_DIR)
        if CACHE_INDEX_PATH.exists():
            CACHE_INDEX_PATH.unlink()
        print("Cache cleared.")
    
    else:
        parser.print_help()
