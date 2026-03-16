export type PolicyRisk = "low" | "medium" | "high" | "critical"

export type PolicyDecision = "allow" | "deny" | "needs-approval"

export type RedlineRule = {
  id: string
  description: string
  pattern: RegExp
}

export type MutationBudgets = {
  maxChangedFiles: number
  maxTotalLocDelta: number
  maxNewFiles: number
  maxToolCalls: number
}

export type AdaptiveStrictnessLevel = "relaxed" | "normal" | "elevated" | "lockdown"

export type AdaptiveStrictnessSignals = {
  mutationCount: number
  mutationToolRatio: number
  largeDiffDetected: boolean
  failedVerificationCount: number
}

export type McpCapabilityClass = "read" | "write" | "execute" | "network"

export type McpCapabilityRule = {
  serverPrefix: string
  maxCallsPerSession: number
  capabilities: McpCapabilityClass[]
}

export type StrictControlPolicy = {
  enabled: boolean
  enforceRedlines: boolean
  recordOnly: boolean
  adaptive: {
    enabled: boolean
  }
  mcp: {
    enabled: boolean
    allowlist: string[]
    denylist: string[]
    capabilityRules: McpCapabilityRule[]
  }
  budgets: MutationBudgets
  redlineRules: RedlineRule[]
}

export type PolicyEvaluation = {
  decision: PolicyDecision
  risk: PolicyRisk
  reason: string
  matchedRuleID?: string
  matchedText?: string
}

export type PolicyInput = {
  toolName: string
  args?: Record<string, unknown>
}
