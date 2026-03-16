import type { SwarmConfig } from "./config.js"

const STRICT_PRESET: Partial<SwarmConfig> = {
  strictControl: {
    enabled: true,
    enforceRedlines: true,
    recordOnly: false,
    adaptive: {
      enabled: true,
    },
    mcpEnabled: true,
    mcpAllowlist: [],
    mcpDenylist: [],
    mcpCapabilityRules: [],
    budgets: {
      maxChangedFiles: 8,
      maxTotalLocDelta: 500,
      maxNewFiles: 5,
      maxToolCalls: 40,
    },
  },
  approval: { enforce: true, ttlMs: 5 * 60 * 1000, defaultReason: "strict-approval" },
  verification: { enforceOnMutation: true },
}

const BALANCED_PRESET: Partial<SwarmConfig> = {
  strictControl: {
    enabled: true,
    enforceRedlines: true,
    recordOnly: true,
    adaptive: {
      enabled: true,
    },
    mcpEnabled: true,
    mcpAllowlist: [],
    mcpDenylist: [],
    mcpCapabilityRules: [],
    budgets: {
      maxChangedFiles: 15,
      maxTotalLocDelta: 1000,
      maxNewFiles: 10,
      maxToolCalls: 80,
    },
  },
  approval: { enforce: true, ttlMs: 10 * 60 * 1000, defaultReason: "manual-approval" },
  verification: { enforceOnMutation: true },
}

const RESEARCH_PRESET: Partial<SwarmConfig> = {
  strictControl: {
    enabled: true,
    enforceRedlines: true,
    recordOnly: true,
    adaptive: {
      enabled: false,
    },
    mcpEnabled: true,
    mcpAllowlist: [],
    mcpDenylist: [],
    mcpCapabilityRules: [],
    budgets: {
      maxChangedFiles: 50,
      maxTotalLocDelta: 3000,
      maxNewFiles: 25,
      maxToolCalls: 200,
    },
  },
  approval: { enforce: false, ttlMs: 20 * 60 * 1000, defaultReason: "research-mode" },
  verification: { enforceOnMutation: false },
}

const AUTOPILOT_PRESET: Partial<SwarmConfig> = {
  planFirst: {
    enabled: true,
    maxPlanAgeMs: 15 * 60 * 1000,
  },
  strictControl: {
    enabled: true,
    enforceRedlines: true,
    recordOnly: false,
    adaptive: {
      enabled: true,
    },
    mcpEnabled: true,
    mcpAllowlist: [],
    mcpDenylist: [],
    mcpCapabilityRules: [],
    delegationMaxDepth: 1,
    delegationMaxNodesPerChain: 2,
    delegationReturnDeadlineMs: 120_000,
    budgets: {
      maxChangedFiles: 5,
      maxTotalLocDelta: 300,
      maxNewFiles: 3,
      maxToolCalls: 30,
    },
  },
  approval: { enforce: true, ttlMs: 3 * 60 * 1000, defaultReason: "autopilot-approval" },
  verification: { enforceOnMutation: true },
  secondOpinion: {
    enabled: true,
    minMutationsBeforeTrigger: 0,
  },
  autopilot: {
    enabled: true,
    cumulativeRiskThreshold: 10,
    maxStepsBeforePause: 5,
  },
}

export function resolveProfile(mode: "strict" | "balanced" | "research" | "autopilot"): Partial<SwarmConfig> {
  switch (mode) {
    case "strict":
      return STRICT_PRESET
    case "balanced":
      return BALANCED_PRESET
    case "research":
      return RESEARCH_PRESET
    case "autopilot":
      return AUTOPILOT_PRESET
    default:
      return BALANCED_PRESET
  }
}
