from __future__ import annotations

import json
import os
import shutil
import subprocess
import argparse
import time
from pathlib import Path
from typing import Any
from datetime import datetime
import importlib.util

from datasets import load_dataset


ROOT = Path(__file__).resolve().parents[4]
WORK_DIR = ROOT / "benchmark" / "swe-rebench"
WORKSPACES_DIR = WORK_DIR / "workspaces"
PREDICTIONS_PATH = WORK_DIR / "predictions" / "predictions.jsonl"
CACHE_DIR = WORK_DIR / "cache" / "predictions"
LOGS_DIR = WORK_DIR / ".logs"
SWARM_CONFIG_PATH = ROOT / ".opencode" / "swe-sworm.json"
DEFAULT_MANIFEST_PATH = WORK_DIR / "instances" / "leaderboard-test.jsonl"

_cache_manager_path = Path(__file__).parent / "cache-manager.py"
_cache_manager_spec = importlib.util.spec_from_file_location("cache_manager", str(_cache_manager_path))
if _cache_manager_spec and _cache_manager_spec.loader:
    cache_manager = importlib.util.module_from_spec(_cache_manager_spec)
    _cache_manager_spec.loader.exec_module(cache_manager)
    load_cache_index = cache_manager.load_cache_index
    save_cache_index = cache_manager.save_cache_index
    load_instance_cache = cache_manager.load_instance_cache
    save_instance_cache = cache_manager.save_instance_cache
    compute_component_hashes = cache_manager.compute_component_hashes
    get_git_commit = cache_manager.get_git_commit
else:
    raise ImportError("Failed to load cache-manager module")


def capture_execution_fingerprint(result: dict[str, Any], model: str) -> dict[str, Any]:
    """Capture actual execution fingerprint from result."""
    stdout = result.get("run_stdout", "")
    stderr = result.get("run_stderr", "")
    combined = f"{stdout} {stderr}"
    
    tools_used = []
    if "edit" in combined or "write" in combined:
        tools_used.extend(["read", "edit", "write"])
    if "bash" in combined or "npm" in combined or "python" in combined:
        tools_used.append("bash")
    if "grep" in combined or "search" in combined:
        tools_used.extend(["grep", "glob"])
    if not tools_used:
        tools_used = ["read"]
    
    agents_invoked = ["main-orchestrator"]
    if "explore" in combined or "delegate" in combined:
        agents_invoked.append("explore")
    if "review" in combined or "second-opinion" in combined:
        agents_invoked.append("code-reviewer")
    if "bug" in combined or "error" in combined.lower():
        agents_invoked.append("bug-hunter")
    
    hooks_triggered = ["tool.execute.before"]
    if result.get("status") == "resolved":
        hooks_triggered.append("tool.execute.after")
    
    policies_applied = ["redlines", "budgets"]
    if "approval" in combined or "approve" in combined:
        policies_applied.append("approval")
    if "delegate" in combined:
        policies_applied.append("delegation")
    
    return {
        "tools_used": list(set(tools_used)),
        "agents_invoked": list(set(agents_invoked)),
        "hooks_triggered": list(set(hooks_triggered)),
        "policies_applied": list(set(policies_applied)),
        "model_used": model,
    }


def estimate_tokens(text: str | None) -> dict[str, Any]:
    """Estimate token count from text using character-based heuristic."""
    if not text:
        return {"chars": 0, "estimated_tokens": 0, "method": "none"}
    
    chars = len(text)
    estimated = chars // 4
    
    return {
        "chars": chars,
        "estimated_tokens": estimated,
        "method": "character_count_proxy",
        "confidence_range": [estimated // 2, estimated * 2],
        "note": "Approximate: actual tokens typically 0.5x-2x of estimate",
    }


def estimate_cost(input_text: str | None, output_text: str | None, model: str) -> dict[str, Any]:
    """Estimate cost based on token counts and model pricing."""
    input_estimate = estimate_tokens(input_text)
    output_estimate = estimate_tokens(output_text)
    
    # Rough pricing per 1M tokens (should be loaded from config)
    pricing = {
        "opencode-go/glm-4.7": {"input": 0.30, "output": 1.20},
        "opencode-go/glm-5": {"input": 0.50, "output": 2.00},
        "github-copilot/gpt-4.1": {"input": 0.60, "output": 2.40},
        "github-copilot/gpt-5": {"input": 1.25, "output": 10.00},
        "github-copilot/gpt-5-codex": {"input": 1.50, "output": 12.00},
    }
    
    model_pricing = pricing.get(model, {"input": 0.60, "output": 2.40})
    
    input_cost = (input_estimate["estimated_tokens"] / 1_000_000) * model_pricing["input"]
    output_cost = (output_estimate["estimated_tokens"] / 1_000_000) * model_pricing["output"]
    total_cost = input_cost + output_cost
    
    return {
        "estimated_input_tokens": input_estimate["estimated_tokens"],
        "estimated_output_tokens": output_estimate["estimated_tokens"],
        "estimated_input_cost_usd": round(input_cost, 6),
        "estimated_output_cost_usd": round(output_cost, 6),
        "estimated_total_cost_usd": round(total_cost, 6),
        "method": "character_count_proxy",
        "confidence_note": "Approximate: actual cost typically 0.5x-2x of estimate",
    }


def log_instance_result(instance_id: str, status: str, duration: float, log_file: Path) -> None:
    """Log instance processing result to a per-instance log file."""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().isoformat()
    log_entry = {
        "timestamp": timestamp,
        "instance_id": instance_id,
        "status": status,
        "duration_seconds": round(duration, 2),
    }
    instance_log = LOGS_DIR / f"{instance_id}.jsonl"
    with open(instance_log, "a") as f:
        f.write(json.dumps(log_entry) + "\n")
    master_log = LOGS_DIR / "all-instances.jsonl"
    with open(master_log, "a") as f:
        f.write(json.dumps(log_entry) + "\n")


def run(
    cmd: list[str],
    cwd: Path | None = None,
    timeout: int = 900,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
        env=env,
    )


def run_with_deadline(
    cmd: list[str],
    cwd: Path | None = None,
    deadline_seconds: int = 3600,
    poll_interval: float = 1.0,
    env: dict[str, str] | None = None,
) -> tuple[subprocess.CompletedProcess[str] | None, bool]:
    """
    Run a command with a deadline. Returns early if the process completes.
    
    Args:
        cmd: Command to run
        cwd: Working directory
        deadline_seconds: Maximum wall time allowed
        poll_interval: How often to check if process is done
        env: Environment variables
        
    Returns:
        Tuple of (result, timed_out)
        - result: CompletedProcess if finished, None if deadline exceeded
        - timed_out: True if deadline was reached before completion
    """
    start_time = time.time()
    deadline = start_time + deadline_seconds
    
    # Start process with a very long timeout (effectively no timeout)
    # We'll manage the deadline ourselves
    process = subprocess.Popen(
        cmd,
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
    )
    
    try:
        while time.time() < deadline:
            # Check if process has completed
            retcode = process.poll()
            if retcode is not None:
                # Process finished
                stdout, stderr = process.communicate()
                result = subprocess.CompletedProcess(
                    cmd, retcode, stdout, stderr
                )
                return result, False
            
            # Sleep before next check
            time.sleep(poll_interval)
        
        # Deadline reached - terminate the process
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        
        stdout, stderr = process.communicate()
        result = subprocess.CompletedProcess(
            cmd, -1, stdout or "", stderr or ""
        )
        return result, True
        
    except Exception:
        # Ensure process is cleaned up on any exception
        process.kill()
        process.wait()
        raise


def ensure_workspace(instance: dict[str, Any]) -> Path:
    workspace = WORKSPACES_DIR / instance["instance_id"]
    reuse_workspace = os.environ.get("SWARM_BENCH_REUSE_WORKSPACE", "1") == "1"
    repo_url = f"https://github.com/{instance['repo']}.git"

    if workspace.exists() and reuse_workspace and (workspace / ".git").exists():
        run(["git", "remote", "remove", "origin"], cwd=workspace)
        run(["git", "remote", "add", "origin", repo_url], cwd=workspace)
    else:
        if workspace.exists():
            shutil.rmtree(workspace, ignore_errors=True)
            if workspace.exists():
                subprocess.run(["rm", "-rf", str(workspace)], check=False)
        workspace.mkdir(parents=True, exist_ok=True)
        run(["git", "init"], cwd=workspace)
        run(["git", "remote", "add", "origin", repo_url], cwd=workspace)

    fetch = run(["git", "fetch", "--depth", "1", "origin", instance["base_commit"]], cwd=workspace, timeout=300)
    if fetch.returncode != 0:
        raise RuntimeError(f"fetch failed for {instance['instance_id']}: {fetch.stderr}")

    checkout = run(["git", "checkout", "FETCH_HEAD"], cwd=workspace)
    if checkout.returncode != 0:
        raise RuntimeError(f"checkout failed for {instance['instance_id']}: {checkout.stderr}")

    run(["git", "reset", "--hard", "FETCH_HEAD"], cwd=workspace)
    run(["git", "clean", "-fdx"], cwd=workspace)

    return workspace


def write_opencode_config(workspace: Path, agent_models: dict[str, str]) -> None:
    config = {
        "$schema": "https://opencode.ai/config.json",
        "permission": {
            "*": "allow",
            "bash": "allow",
            "edit": "allow",
            "write": "allow",
            "read": "allow",
            "grep": "allow",
            "glob": "allow",
            "list": "allow",
        },
    }
    (workspace / "opencode.json").write_text(json.dumps(config, indent=2))

    opencode_dir = workspace / ".opencode"
    opencode_dir.mkdir(exist_ok=True)
    write_benchmark_agents(opencode_dir, agent_models)
    if SWARM_CONFIG_PATH.exists():
        (opencode_dir / "swe-sworm.json").write_text(SWARM_CONFIG_PATH.read_text())


def get_agent_models() -> dict[str, str]:
    """Get all agent models from config."""
    if not SWARM_CONFIG_PATH.exists():
        return {}
    data = json.loads(SWARM_CONFIG_PATH.read_text())
    plugin = data.get("plugin", {}).get("swe-sworm", {}) if isinstance(data, dict) else {}
    agent_models = plugin.get("agentModels", {}) if isinstance(plugin, dict) else {}
    result = {}
    for agent, config in agent_models.items():
        if isinstance(config, dict):
            model = config.get("model")
            if isinstance(model, str):
                result[agent] = model
    return result


def write_benchmark_agents(opencode_dir: Path, agent_models: dict[str, str]) -> None:
    agents_dir = opencode_dir / "agents"
    agents_dir.mkdir(parents=True, exist_ok=True)
    
    # Get main orchestrator model (fallback to default if not in config)
    main_model = agent_models.get("main-orchestrator", "opencode-go/glm-4.7")
    
    main_orchestrator = f"""---
name: main-orchestrator
description: Benchmark orchestrator agent for SWE-rebench runs.
mode: primary
model: {main_model}
temperature: 0.1
tools:
  read: true
  grep: true
  glob: true
  list: true
  bash: true
  edit: true
  write: true
  approval: true
  codeAnalyzer: true
  bugDetector: true
  reviewTool: true
  delegate: true
  delegation_status: true
  delegation_read: true
---

You are the benchmark main orchestrator. Solve the task with minimal correct edits.
"""
    (agents_dir / "main-orchestrator.md").write_text(main_orchestrator)

    # Explore agent
    explore_model = agent_models.get("explore", "opencode-go/glm-4.7")
    explore_agent = f"""---
name: explore
description: Read-only exploration subagent for benchmark runs.
mode: subagent
model: {explore_model}
temperature: 0.1
tools:
  read: true
  grep: true
  glob: true
  list: true
---

Find relevant files and concise evidence.
"""
    (agents_dir / "explore.md").write_text(explore_agent)

    # Code reviewer agent
    reviewer_model = agent_models.get("code-reviewer", "opencode-go/glm-5")
    reviewer_agent = f"""---
name: code-reviewer
description: Lightweight review subagent for benchmark runs.
mode: subagent
model: {reviewer_model}
temperature: 0.1
tools:
  read: true
  grep: true
  glob: true
  reviewTool: true
  bugDetector: true
---

Review proposed edits and report risks.
"""
    (agents_dir / "code-reviewer.md").write_text(reviewer_agent)

    # Bug hunter agent
    bug_hunter_model = agent_models.get("bug-hunter", "github-copilot/gpt-4.1")
    bug_hunter_agent = f"""---
name: bug-hunter
description: Targeted bug analysis subagent for benchmark runs.
mode: subagent
model: {bug_hunter_model}
temperature: 0.1
tools:
  read: true
  grep: true
  glob: true
  bugDetector: true
---

Identify likely root cause and candidate minimal fix locations.
"""
    (agents_dir / "bug-hunter.md").write_text(bug_hunter_agent)


def resolve_main_model() -> str:
    if not SWARM_CONFIG_PATH.exists():
        return "opencode-go/glm-4.7"
    data = json.loads(SWARM_CONFIG_PATH.read_text())
    plugin = data.get("plugin", {}).get("swe-sworm", {}) if isinstance(data, dict) else {}
    agent_models = plugin.get("agentModels", {}) if isinstance(plugin, dict) else {}
    main = agent_models.get("main-orchestrator", {}) if isinstance(agent_models, dict) else {}
    model = main.get("model") if isinstance(main, dict) else None
    return model if isinstance(model, str) and model else "opencode-go/glm-4.7"


def generate_patch(instance: dict[str, Any], profile: str, deadline_seconds: int | None = None, use_cache: bool = True) -> dict[str, Any]:
    instance_id = instance["instance_id"]
    start_time = time.time()
    
    if use_cache:
        cached_data = load_instance_cache(instance_id, profile)
        if cached_data is not None:
            # Check if cache is still valid
            index = load_cache_index()
            entry = index.get("instances", {}).get(instance_id, {})
            if entry.get("validation_status") != "needs_refresh":
                print(f"  [CACHE HIT] {instance_id} - using cached result")
                return cached_data.get("result", cached_data)
    
    workspace = ensure_workspace(instance)
    agent_models = get_agent_models()
    write_opencode_config(workspace, agent_models)

    shared_home_env = os.environ.get("SWARM_BENCH_SHARED_HOME")
    sandbox_home = Path(shared_home_env) if shared_home_env else (workspace / ".sandbox-home")
    (sandbox_home / ".local" / "share" / "opencode").mkdir(parents=True, exist_ok=True)
    (sandbox_home / ".config" / "opencode").mkdir(parents=True, exist_ok=True)

    host_auth = Path.home() / ".local" / "share" / "opencode" / "auth.json"
    sandbox_auth = sandbox_home / ".local" / "share" / "opencode" / "auth.json"
    if host_auth.exists() and not sandbox_auth.exists():
        shutil.copy2(host_auth, sandbox_auth)

    host_db = Path.home() / ".local" / "share" / "opencode" / "opencode.db"
    sandbox_db = sandbox_home / ".local" / "share" / "opencode" / "opencode.db"
    if host_db.exists() and not sandbox_db.exists():
        shutil.copy2(host_db, sandbox_db)

    host_cache = Path.home() / ".cache" / "opencode"
    sandbox_cache = sandbox_home / ".cache" / "opencode"
    if host_cache.exists() and not sandbox_cache.exists():
        shutil.copytree(host_cache, sandbox_cache, ignore_dangling_symlinks=True)

    env = os.environ.copy()
    env["HOME"] = str(sandbox_home)

    prompt = (
        "Solve this SWE-rebench issue by editing files in the current repository. "
        "Keep changes minimal and correct. Do not output explanations.\n\n"
        f"Instance: {instance_id}\n"
        f"Repository: {instance['repo']}\n"
        f"Problem statement:\n{instance['problem_statement']}\n"
    )

    model = resolve_main_model()
    timed_out = False

    if deadline_seconds is not None and deadline_seconds > 0:
        run_result, timed_out = run_with_deadline(
            ["opencode", "run", "--agent", "main-orchestrator", "--model", model, prompt],
            cwd=workspace,
            deadline_seconds=deadline_seconds,
            poll_interval=1.0,
            env=env,
        )
        
        if timed_out:
            run_stdout = ""
            run_stderr = f"Deadline exceeded after {deadline_seconds}s"
        elif run_result is not None:
            run_stdout = run_result.stdout[-4000:] if run_result.stdout else ""
            run_stderr = run_result.stderr[-4000:] if run_result.stderr else ""
        else:
            run_stdout = ""
            run_stderr = f"Deadline exceeded after {deadline_seconds}s"
    else:
        timeout_seconds = int(os.environ.get("SWARM_BENCH_OPENCODE_TIMEOUT", "900"))
        try:
            run_result = run(
                ["opencode", "run", "--agent", "main-orchestrator", "--model", model, prompt],
                cwd=workspace,
                timeout=timeout_seconds,
                env=env,
            )
            run_stdout = run_result.stdout[-4000:]
            run_stderr = run_result.stderr[-4000:]
        except subprocess.TimeoutExpired:
            timed_out = True
            run_stdout = ""
            run_stderr = f"Timeout after {timeout_seconds}s"

    diff = run(["git", "diff", "--binary"], cwd=workspace, timeout=120)
    patch = diff.stdout if diff.returncode == 0 else ""

    if not patch.strip():
        patch = ""

    duration = time.time() - start_time
    
    if timed_out:
        status = "timed_out"
    elif patch:
        status = "resolved"
    else:
        status = "unresolved"
    
    result = {
        "instance_id": instance_id,
        "model_name_or_path": model,
        "model_patch": patch,
        "benchmark_profile": profile,
        "agent_name": "main-orchestrator",
        "run_stdout": run_stdout,
        "run_stderr": run_stderr,
        "status": status,
        "duration_seconds": round(duration, 2),
    }
    
    log_instance_result(instance_id, status, duration, LOGS_DIR / "all-instances.jsonl")

    if use_cache:
        fingerprint = capture_execution_fingerprint(result, model)
        save_instance_cache(instance_id, profile, result, fingerprint)

    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate budget-safe pilot predictions with OpenCode")
    parser.add_argument("--profile", default="poor", choices=["rich", "poor"])
    parser.add_argument("--count", type=int, default=3)
    parser.add_argument("--instance-id", action="append", dest="instance_ids")
    parser.add_argument("--manifest-path", default=str(DEFAULT_MANIFEST_PATH))
    parser.add_argument("--deadline", type=int, default=None,
                        help="Maximum wall time in seconds. Process returns early if results are ready before deadline.")
    parser.add_argument("--cache", type=lambda x: x.lower() in ('true', '1', 'yes'), default=True,
                        help="Enable/disable result caching. Use 'no' to disable cache.")
    args = parser.parse_args()

    profile = args.profile
    instance_count = max(1, args.count)
    deadline_seconds = args.deadline
    use_cache = args.cache

    WORKSPACES_DIR.mkdir(parents=True, exist_ok=True)
    (WORK_DIR / "predictions").mkdir(parents=True, exist_ok=True)

    manifest_path = Path(args.manifest_path)
    selected: list[dict[str, Any]] = []
    if manifest_path.exists():
        lines = [line for line in manifest_path.read_text().splitlines() if line.strip()]
        records: list[dict[str, Any]] = []
        for line in lines:
            parsed = json.loads(line)
            if isinstance(parsed, dict):
                records.append(parsed)
        if args.instance_ids:
            wanted = set(args.instance_ids)
            selected = [item for item in records if item.get("instance_id") in wanted]
        else:
            selected = records[: min(instance_count, len(records))]
    else:
        dataset = load_dataset("nebius/SWE-rebench-leaderboard", split="test")
        dataset_records: list[dict[str, Any]] = []
        for item in dataset:
            if isinstance(item, dict):
                dataset_records.append(dict(item))
        if args.instance_ids:
            wanted = set(args.instance_ids)
            selected = [item for item in dataset_records if item.get("instance_id") in wanted]
        else:
            selected = dataset_records[: min(instance_count, len(dataset_records))]

    predictions: list[dict[str, Any]] = []
    for instance in selected:
        predictions.append(generate_patch(instance, profile, deadline_seconds, use_cache))

    lines = [json.dumps(item) for item in predictions]
    PREDICTIONS_PATH.write_text("\n".join(lines) + "\n")
    print(f"Wrote {len(predictions)} predictions to {PREDICTIONS_PATH}")


if __name__ == "__main__":
    main()
