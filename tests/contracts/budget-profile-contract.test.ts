import { describe, expect, it, vi } from "vitest"
import { RunLedger } from "../../src/audit/run-ledger.js"
import { setConfig } from "../../src/config.js"
import { createExecutionHooks } from "../../src/create-execution-hooks.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../src/policy/defaults.js"

function createHooksForMode(mode: "strict" | "balanced" | "research") {
  setConfig({ mode })
  const runLedger = new RunLedger()
  const hooks = createExecutionHooks({
    client: { app: { log: vi.fn().mockResolvedValue({}) } },
    directory: "/tmp/swe-bundle-10",
    runLedger,
    strictPolicy: {
      ...DEFAULT_STRICT_CONTROL_POLICY,
      recordOnly: true,
      budgets: {
        maxChangedFiles: 1,
        maxTotalLocDelta: 1,
        maxNewFiles: 1,
        maxToolCalls: 1,
      },
    },
    governanceMetadata: {
      worktree: "/tmp/swe-bundle-10",
      projectID: "proj-bundle-10",
      serverUrl: "http://localhost:4096",
    },
    toolsAllowedWhileDelegating: new Set(["approval", "delegation_status"]),
    blockedCalls: new Set<string>(),
    delegationBlockedMessages: new Map<string, string>(),
    policyBlockedMessages: new Map<string, string>(),
    budgetBlockedMessages: new Map<string, string>(),
    sessionMetrics: {
      toolCalls: 5,
      filesModified: 5,
      startTime: Date.now(),
      toolUsage: new Map([[
        "edit",
        5,
      ]]),
      largeDiffDetected: false,
      failedVerificationCount: 0,
      secondOpinionRequests: 0,
      secondOpinionCacheHits: 0,
      secondOpinionEscalations: 0,
      adaptiveStrictness: "normal",
    },
    featureFlags: { enableVerificationContract: true },
    approvalTtlMs: 60_000,
    approvalDefaultReason: "manual",
    delegationRuntime: null,
    readSessionDiffSummary: async () => null,
    readTodoPressure: async () => null,
    saveRunLedgerSnapshot: async () => undefined,
    planFirstConfig: { enabled: false, maxPlanAgeMs: 30 * 60 * 1000 },
    listThoughts: async () => [],
    availableAgents: new Set(["second-opinion", "code-reviewer"]),
    secondOpinionConfig: {
      enabled: false,
      minMutationsBeforeTrigger: 0,
      tier1TimeoutMs: 1000,
      tier2TimeoutMs: 1000,
      tier1Agent: "second-opinion",
      tier2Agent: "code-reviewer",
      escalateConfidenceThreshold: 0.7,
      maxEscalationsPerSession: 2,
    },
    requestSecondOpinion: async () => ({
      verdict: "proceed",
      risks: [],
      suggestion: null,
      confidence: 1,
      reviewerTier: "lightweight",
    }),
  })
  return { hooks, runLedger }
}

describe("budget profile contract", () => {
  it("enforces hard block only in strict mode and advisory in non-strict modes", async () => {
    const strict = createHooksForMode("strict")
    strict.runLedger.recordToolCall("bundle-10-strict")
    strict.runLedger.recordToolCall("bundle-10-strict")
    const strictOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
    }
    await strict.hooks["tool.execute.before"]({ tool: "edit", sessionID: "bundle-10-strict" }, strictOutput)

    expect(strictOutput.args).toBeUndefined()
    expect(strictOutput.metadata?.budgetBlocked).toBe(true)
    expect(String(strictOutput.output)).toContain("Budget")
    expect(String(strictOutput.metadata?.budgetReason)).toContain("budget-tool-calls-exceeded")

    const balanced = createHooksForMode("balanced")
    balanced.runLedger.recordToolCall("bundle-10-balanced")
    balanced.runLedger.recordToolCall("bundle-10-balanced")
    const balancedOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
    }
    await balanced.hooks["tool.execute.before"]({ tool: "edit", sessionID: "bundle-10-balanced" }, balancedOutput)

    expect(balancedOutput.args).toBeDefined()
    expect(balancedOutput.metadata?.budgetAdvisory).toBe(true)
    expect(String(balancedOutput.output)).toContain("Budget")
    expect(String(balancedOutput.metadata?.budgetReason)).toContain("budget-tool-calls-exceeded")

    const research = createHooksForMode("research")
    research.runLedger.recordToolCall("bundle-10-research")
    research.runLedger.recordToolCall("bundle-10-research")
    const researchOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
    }
    await research.hooks["tool.execute.before"]({ tool: "edit", sessionID: "bundle-10-research" }, researchOutput)

    expect(researchOutput.args).toBeDefined()
    expect(researchOutput.metadata?.budgetAdvisory).toBe(true)
    expect(String(researchOutput.output)).toContain("Budget")
    expect(String(researchOutput.metadata?.budgetReason)).toContain("budget-tool-calls-exceeded")
  })
})
