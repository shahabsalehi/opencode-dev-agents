import { DEFAULT_STRICT_CONTROL_POLICY } from "./policy/defaults.js"
import { DEFAULTS } from "./config.js"
import type { StrictControlPolicy } from "./policy/types.js"
import type { SwarmConfig } from "./config.js"

export type GovernanceMetadata = {
  worktree: string
  projectID: string
  serverUrl: string
}

export function createPolicyRuntime(input: {
  strictControlConfig: SwarmConfig["strictControl"]
  worktree: string
  projectID: string
  serverUrl: string
}): {
  strictPolicy: StrictControlPolicy
  governanceMetadata: GovernanceMetadata
} {
  const strictPolicy: StrictControlPolicy = {
    ...DEFAULT_STRICT_CONTROL_POLICY,
    enabled: input.strictControlConfig?.enabled ?? DEFAULTS.strictControl.enabled,
    enforceRedlines: input.strictControlConfig?.enforceRedlines ?? DEFAULTS.strictControl.enforceRedlines,
    recordOnly: input.strictControlConfig?.recordOnly ?? DEFAULTS.strictControl.recordOnly,
    adaptive: {
      enabled: input.strictControlConfig?.adaptive?.enabled ?? DEFAULTS.strictControl.adaptive.enabled,
    },
    mcp: {
      enabled: input.strictControlConfig?.mcpEnabled ?? DEFAULT_STRICT_CONTROL_POLICY.mcp.enabled,
      allowlist: input.strictControlConfig?.mcpAllowlist ?? DEFAULT_STRICT_CONTROL_POLICY.mcp.allowlist,
      denylist: input.strictControlConfig?.mcpDenylist ?? DEFAULT_STRICT_CONTROL_POLICY.mcp.denylist,
      capabilityRules: input.strictControlConfig?.mcpCapabilityRules?.map((rule) => ({
        serverPrefix: rule.serverPrefix,
        maxCallsPerSession: rule.maxCallsPerSession ?? 50,
        capabilities: rule.capabilities ?? ["read", "write", "execute", "network"],
      })) ?? DEFAULT_STRICT_CONTROL_POLICY.mcp.capabilityRules,
    },
    budgets: {
      maxChangedFiles:
        input.strictControlConfig?.budgets?.maxChangedFiles ??
        DEFAULTS.strictControl.budgets.maxChangedFiles,
      maxTotalLocDelta:
        input.strictControlConfig?.budgets?.maxTotalLocDelta ??
        DEFAULTS.strictControl.budgets.maxTotalLocDelta,
      maxNewFiles:
        input.strictControlConfig?.budgets?.maxNewFiles ??
        DEFAULTS.strictControl.budgets.maxNewFiles,
      maxToolCalls:
        input.strictControlConfig?.budgets?.maxToolCalls ??
        DEFAULTS.strictControl.budgets.maxToolCalls,
    },
  }

  return {
    strictPolicy,
    governanceMetadata: {
      worktree: input.worktree,
      projectID: input.projectID,
      serverUrl: input.serverUrl,
    },
  }
}
