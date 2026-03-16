import { findMatchedRedline } from "./redlines.js"
import type { PolicyEvaluation, PolicyInput, StrictControlPolicy } from "./types.js"
import { evaluateMcpAccess } from "./mcp-governance.js"

const LOW_RISK_TOOLS = new Set([
  "read",
  "glob",
  "grep",
  "ls",
  "codeAnalyzer",
  "dependencyGraph",
  "bugDetector",
  "reviewTool",
  "approval",
  "delegation_read",
  "delegation_list",
  "thought_list",
  "external_scout",
  "governance_eval",
  "tool_result_normalize",
  "mutation_cluster_plan",
  "mcp_bundle_list",
  "mcp_bundle_generate",
])

const HIGH_RISK_TOOLS = new Set([
  "edit",
  "write",
  "apply_patch",
  "testGenerator",
  "refactorEngine",
  "bash",
  "interactive_bash",
])

const SHELL_TOOLS = new Set(["bash", "interactive_bash"])

function extractCommand(args?: Record<string, unknown>): string {
  if (!args) return ""
  const command = args.command
  if (typeof command === "string") return command
  const tmuxCommand = args.tmux_command
  if (typeof tmuxCommand === "string") return tmuxCommand
  return ""
}

export function evaluatePolicy(input: PolicyInput, policy: StrictControlPolicy, sessionID?: string): PolicyEvaluation {
  if (!policy.enabled) {
    return { decision: "allow", risk: "low", reason: "policy-disabled" }
  }

  const { toolName, args } = input
  const command = extractCommand(args)

  const mcpDecision = evaluateMcpAccess(toolName, policy, args, sessionID)
  if (!mcpDecision.allowed) {
    return {
      decision: policy.recordOnly ? "allow" : "deny",
      risk: policy.recordOnly ? "medium" : "high",
      reason: mcpDecision.reason,
    }
  }

  if (SHELL_TOOLS.has(toolName) && policy.enforceRedlines && command.length > 0) {
    const matched = findMatchedRedline(command, policy.redlineRules)
    if (matched) {
      return {
        decision: "deny",
        risk: "critical",
        reason: `redline:${matched.id}`,
        matchedRuleID: matched.id,
        matchedText: command,
      }
    }
  }

  if (toolName.startsWith("skill_read:")) {
    return { decision: "allow", risk: "low", reason: "skill-low-risk" }
  }

  if (toolName.startsWith("skill_write:")) {
    if (policy.recordOnly) {
      return { decision: "allow", risk: "high", reason: "record-only-high-risk-skill" }
    }
    return { decision: "needs-approval", risk: "high", reason: "skill-high-risk" }
  }

  if (toolName.startsWith("skill:")) {
    if (policy.recordOnly) {
      return { decision: "allow", risk: "medium", reason: "record-only-medium-risk-skill" }
    }
    return { decision: "needs-approval", risk: "medium", reason: "skill-medium-risk" }
  }

  if (LOW_RISK_TOOLS.has(toolName)) {
    return { decision: "allow", risk: "low", reason: "low-risk-tool" }
  }

  if (HIGH_RISK_TOOLS.has(toolName)) {
    if (policy.recordOnly) {
      return { decision: "allow", risk: "high", reason: "record-only-high-risk" }
    }
    return { decision: "needs-approval", risk: "high", reason: "high-risk-tool" }
  }

  if (policy.recordOnly) {
    return { decision: "allow", risk: "medium", reason: "record-only-default" }
  }

  return { decision: "needs-approval", risk: "medium", reason: "unknown-tool-needs-approval" }
}
