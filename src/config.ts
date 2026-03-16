import { resolveProfile } from "./config-profiles.js"
import type { SecondOpinionConfig } from "./opinion/types.js"

export type OperatorMode = "strict" | "balanced" | "research" | "autopilot"

export type SwarmConfig = {
  profile?: "strict" | "balanced" | "research" | "autopilot" | "custom"
  mode?: OperatorMode
  tools?: {
    codeAnalyzer?: { mode?: "fast" | "balanced" | "precise"; threshold?: number; maxFiles?: number; diffOnly?: boolean }
    bugDetector?: { mode?: "fast" | "balanced" | "precise"; severity?: "all" | "low" | "medium" | "high" | "critical"; maxResults?: number; maxFiles?: number; diffOnly?: boolean }
    dependencyGraph?: { depth?: number; maxFiles?: number; diffOnly?: boolean }
    testGenerator?: { framework?: string; diffOnly?: boolean; includePrivate?: boolean }
    refactorEngine?: { mode?: "lint" | "precision"; dryRun?: boolean; diffOnly?: boolean }
    reviewTool?: { mode?: "fast" | "balanced" | "precise"; minHighConfidenceRatio?: number; focus?: "all" | "security" | "performance" | "quality" | "style"; diffOnly?: boolean }
  }
  context?: { linesPerFile?: number; totalLines?: number }
  planFirst?: {
    enabled?: boolean
    maxPlanAgeMs?: number
  }
  routing?: {
    defaultAgent?: string
    preferStrongModelForWrite?: boolean
    escalationRules?: Array<{
      pattern: string
      agent: string
    }>
    maxDepth?: number
    maxNodesPerChain?: number
    maxParallelDelegations?: number
  }
  agentModels?: Record<string, {
    model: string
    modelParameters?: Record<string, unknown>
  }>
  benchmarkProfile?: string
  approval?: {
    ttlMs?: number
    defaultReason?: string
    enforce?: boolean
    contextRules?: Array<{
      pathPrefix: string
      requireApproval: boolean
    }>
  }
  verification?: {
    enforceOnMutation?: boolean
    minCoverage?: number
  }
  strictControl?: {
    enabled?: boolean
    enforceRedlines?: boolean
    recordOnly?: boolean
    adaptive?: {
      enabled?: boolean
    }
    mcpEnabled?: boolean
    mcpAllowlist?: string[]
    mcpDenylist?: string[]
    mcpCapabilityRules?: Array<{
      serverPrefix: string
      maxCallsPerSession?: number
      capabilities?: Array<"read" | "write" | "execute" | "network">
    }>
    delegationMaxDepth?: number
    delegationMaxNodesPerChain?: number
    delegationReturnDeadlineMs?: number
    budgets?: {
      maxChangedFiles?: number
      maxTotalLocDelta?: number
      maxNewFiles?: number
      maxToolCalls?: number
    }
  }
  compatibility?: {
    enableExperimentalCompaction?: boolean
    enableSystemTransform?: boolean
    enableDelegationRuntime?: boolean
    enableVerificationContract?: boolean
    enableChatMessagesTransform?: boolean
    enableTextCompleteHook?: boolean
    enableAuthHook?: boolean
    enableCompactionRescue?: boolean
  }
  storage?: {
    delegationsTTL?: string | number
    thoughtsTTL?: string | number
    maxPromptLength?: number
    maxResultLength?: number
    maxAgentLength?: number
    maxTitleLength?: number
    maxContentLength?: number
  }
  skills?: {
    enabled?: boolean
    allowlist?: string[]
    loadFromDirectory?: boolean
    directory?: string
    defaultRiskLevel?: "low" | "medium" | "high"
  }
  secondOpinion?: Partial<SecondOpinionConfig>
  autopilot?: {
    cumulativeRiskThreshold?: number
    maxStepsBeforePause?: number
    enabled?: boolean
  }
}

export const DEFAULTS = {
  mode: "strict" as OperatorMode,
  tools: {
    codeAnalyzer: { mode: "precise" as const, threshold: 70, maxFiles: 50, diffOnly: false },
    bugDetector: { mode: "precise" as const, severity: "all" as const, maxResults: 100, maxFiles: 200, diffOnly: false },
    dependencyGraph: { depth: 5, maxFiles: 500, diffOnly: false },
    testGenerator: { framework: "jest", diffOnly: false, includePrivate: false },
    refactorEngine: { mode: "lint" as const, dryRun: true, diffOnly: false },
    reviewTool: { mode: "precise" as const, minHighConfidenceRatio: 0.7, focus: "all" as const, diffOnly: false }
  },
  context: { linesPerFile: 60, totalLines: 200 },
  planFirst: {
    enabled: false,
    maxPlanAgeMs: 30 * 60 * 1000,
  },
  routing: {
    defaultAgent: "explore",
    preferStrongModelForWrite: true,
    escalationRules: [],
    maxDepth: 2,
    maxNodesPerChain: 3,
    maxParallelDelegations: 1,
  },
  agentModels: {},
  approval: {
    ttlMs: 10 * 60 * 1000,
    defaultReason: "manual-approval",
    enforce: true,
    contextRules: [],
  },
  verification: {
    enforceOnMutation: true,
    minCoverage: 0,
  },
  strictControl: {
    enabled: true,
    enforceRedlines: true,
    recordOnly: true,
    adaptive: {
      enabled: false,
    },
    mcpCapabilityRules: [] as Array<{
      serverPrefix: string
      maxCallsPerSession?: number
      capabilities?: Array<"read" | "write" | "execute" | "network">
    }>,
    delegationMaxDepth: 2,
    delegationMaxNodesPerChain: 3,
    delegationReturnDeadlineMs: 300_000,
    budgets: {
      maxChangedFiles: 25,
      maxTotalLocDelta: 1200,
      maxNewFiles: 20,
      maxToolCalls: 150,
    },
  },
  compatibility: {
    enableExperimentalCompaction: true,
    enableSystemTransform: true,
    enableDelegationRuntime: true,
    enableVerificationContract: true,
    enableChatMessagesTransform: true,
    enableTextCompleteHook: false,
    enableAuthHook: false,
    enableCompactionRescue: false,
  },
  storage: {
    delegationsTTL: "7d",
    thoughtsTTL: "30d",
    maxPromptLength: 10000,
    maxResultLength: 50000,
    maxAgentLength: 100,
    maxTitleLength: 200,
    maxContentLength: 50000
  },
  skills: {
    enabled: false,
    allowlist: [] as string[],
    loadFromDirectory: true,
    directory: ".opencode/skills",
    defaultRiskLevel: "medium" as const,
  },
  secondOpinion: {
    enabled: true,
    minMutationsBeforeTrigger: 0,
    tier1TimeoutMs: 5000,
    tier2TimeoutMs: 8000,
    tier1Agent: "second-opinion",
    tier2Agent: "code-reviewer",
    escalateConfidenceThreshold: 0.72,
    maxEscalationsPerSession: 2,
  },
  autopilot: {
    enabled: true,
    cumulativeRiskThreshold: 10,
    maxStepsBeforePause: 5,
  }
}

let config: SwarmConfig = {}

export function setConfig(next: SwarmConfig): void {
  config = applyOperatorPreset(sanitizeConfig(next))
}

export function getConfig(): SwarmConfig {
  return config
}

export function resolveNumber(value: number, override: number | undefined, defaultValue: number): number {
  if (value === defaultValue && override !== undefined) return override
  return value
}

export function resolveBoolean(value: boolean, override: boolean | undefined, defaultValue: boolean): boolean {
  if (value === defaultValue && override !== undefined) return override
  return value
}

export function resolveString(value: string, override: string | undefined, defaultValue: string): string {
  if (value === defaultValue && override !== undefined) return override
  return value
}

export function parseDuration(value: string | number | undefined, fallback: number): number {
  if (typeof value === "number") return value
  if (!value) return fallback
  const match = /^([0-9]+)(ms|s|m|h|d)$/.exec(value.trim())
  if (!match) return fallback
  const amount = Number(match[1])
  const unit = match[2]
  const multipliers: Record<string, number> = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }
  return amount * multipliers[unit]
}

function sanitizeConfig(input: SwarmConfig): SwarmConfig {
  const mode = sanitizeMode(input.mode)
  return {
    ...input,
    mode,
  }
}

function sanitizeMode(mode: OperatorMode | undefined): OperatorMode {
  if (mode === "strict" || mode === "balanced" || mode === "research" || mode === "autopilot") {
    return mode
  }
  return DEFAULTS.mode
}

function applyOperatorPreset(input: SwarmConfig): SwarmConfig {
  const mode = sanitizeMode(input.mode)
  const preset = resolveProfile(mode)
  return {
    ...preset,
    ...input,
    mode,
    strictControl: {
      ...preset.strictControl,
      ...input.strictControl,
    },
    approval: {
      ...preset.approval,
      ...input.approval,
    },
    verification: {
      ...preset.verification,
      ...input.verification,
    },
    autopilot: {
      ...DEFAULTS.autopilot,
      ...preset.autopilot,
      ...input.autopilot,
    },
  }
}
