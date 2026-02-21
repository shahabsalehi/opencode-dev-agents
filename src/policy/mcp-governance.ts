import type { StrictControlPolicy } from "./types.js"
import { classifyMcpTool, findMatchingCapabilityRule } from "./mcp-capabilities.js"
import { mcpRateLimiter } from "./mcp-rate-limit.js"

export type McpAccessDecision = {
  allowed: boolean
  reason: string
}

export function isMcpTool(toolName: string): boolean {
  return toolName.startsWith("mcp_") || toolName.startsWith("mcp.") || toolName.startsWith("mcp__")
}

export function evaluateMcpAccess(
  toolName: string,
  policy: StrictControlPolicy,
  args?: Record<string, unknown>,
  sessionID = "global"
): McpAccessDecision {
  if (!isMcpTool(toolName)) {
    return { allowed: true, reason: "not-mcp" }
  }

  if (!policy.mcp.enabled) {
    return { allowed: true, reason: "mcp-policy-disabled" }
  }

  if (policy.mcp.denylist.includes(toolName)) {
    return { allowed: false, reason: "mcp-denylist" }
  }

  if (policy.mcp.allowlist.length > 0 && !policy.mcp.allowlist.includes(toolName)) {
    return { allowed: false, reason: "mcp-not-allowlisted" }
  }

  const matchedRule = findMatchingCapabilityRule(toolName, policy.mcp.capabilityRules)
  if (matchedRule) {
    const capability = classifyMcpTool(toolName, args)
    if (!matchedRule.capabilities.includes(capability)) {
      return {
        allowed: false,
        reason: `mcp-capability-denied:${capability}`,
      }
    }

    const limitCheck = mcpRateLimiter.check(matchedRule.serverPrefix, sessionID, matchedRule.maxCallsPerSession)
    if (!limitCheck.allowed) {
      return {
        allowed: false,
        reason: "mcp-rate-limit-exceeded",
      }
    }

    mcpRateLimiter.record(matchedRule.serverPrefix, sessionID)
  }

  return { allowed: true, reason: "mcp-allowed" }
}
