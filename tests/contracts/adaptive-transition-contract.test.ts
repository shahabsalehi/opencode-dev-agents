import { describe, expect, it, vi } from "vitest"
import { RunLedger } from "../../src/audit/run-ledger.js"
import { setConfig } from "../../src/config.js"
import { createExecutionHooks } from "../../src/create-execution-hooks.js"
import { evaluateAdaptiveStrictness } from "../../src/policy/adaptive.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../src/policy/defaults.js"

describe("adaptive transition contract", () => {
  it("enforces deterministic threshold transition matrix", () => {
    const matrix: Array<{
      mutationCount: number
      mutationToolRatio: number
      largeDiffDetected: boolean
      failedVerificationCount: number
      expected: "relaxed" | "normal" | "elevated" | "lockdown"
    }> = [
      { mutationCount: 0, mutationToolRatio: 0, largeDiffDetected: false, failedVerificationCount: 0, expected: "relaxed" },
      { mutationCount: 1, mutationToolRatio: 0.2, largeDiffDetected: false, failedVerificationCount: 0, expected: "normal" },
      { mutationCount: 7, mutationToolRatio: 0.7, largeDiffDetected: false, failedVerificationCount: 0, expected: "normal" },
      { mutationCount: 8, mutationToolRatio: 0.7, largeDiffDetected: false, failedVerificationCount: 0, expected: "elevated" },
      { mutationCount: 4, mutationToolRatio: 0.71, largeDiffDetected: false, failedVerificationCount: 0, expected: "elevated" },
      { mutationCount: 2, mutationToolRatio: 0.2, largeDiffDetected: true, failedVerificationCount: 0, expected: "elevated" },
      { mutationCount: 2, mutationToolRatio: 0.2, largeDiffDetected: false, failedVerificationCount: 1, expected: "elevated" },
      { mutationCount: 15, mutationToolRatio: 0.8, largeDiffDetected: true, failedVerificationCount: 0, expected: "lockdown" },
      { mutationCount: 4, mutationToolRatio: 0.2, largeDiffDetected: false, failedVerificationCount: 3, expected: "lockdown" },
    ]

    for (const row of matrix) {
      expect(
        evaluateAdaptiveStrictness({
          mutationCount: row.mutationCount,
          mutationToolRatio: row.mutationToolRatio,
          largeDiffDetected: row.largeDiffDetected,
          failedVerificationCount: row.failedVerificationCount,
        })
      ).toBe(row.expected)
    }
  })

  it("has zero dependency on wall-clock time", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-17T00:00:00.000Z"))

    const signals = {
      mutationCount: 8,
      mutationToolRatio: 0.5,
      largeDiffDetected: false,
      failedVerificationCount: 0,
    }
    const first = evaluateAdaptiveStrictness(signals)
    vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    const second = evaluateAdaptiveStrictness(signals)

    expect(first).toBe("elevated")
    expect(second).toBe("elevated")
    expect(second).toBe(first)

    vi.useRealTimers()
  })

  it("emits adaptive strictness metadata from execution hooks", async () => {
    setConfig({ mode: "strict", strictControl: { adaptive: { enabled: true } } })

    const hooks = createExecutionHooks({
      client: { app: { log: vi.fn().mockResolvedValue({}) } },
      directory: "/tmp/swe-bundle-09",
      runLedger: new RunLedger(),
      strictPolicy: {
        ...DEFAULT_STRICT_CONTROL_POLICY,
        recordOnly: true,
        adaptive: { enabled: true },
      },
      governanceMetadata: {
        worktree: "/tmp/swe-bundle-09",
        projectID: "proj-bundle-09",
        serverUrl: "http://localhost:4096",
      },
      toolsAllowedWhileDelegating: new Set(["approval", "delegation_status"]),
      blockedCalls: new Set<string>(),
      delegationBlockedMessages: new Map<string, string>(),
      policyBlockedMessages: new Map<string, string>(),
      budgetBlockedMessages: new Map<string, string>(),
      sessionMetrics: {
        toolCalls: 12,
        filesModified: 8,
        startTime: Date.now(),
        toolUsage: new Map([[
          "edit",
          9,
        ]]),
        largeDiffDetected: false,
        failedVerificationCount: 0,
        secondOpinionRequests: 0,
        secondOpinionCacheHits: 0,
        secondOpinionEscalations: 0,
        adaptiveStrictness: "relaxed",
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

    const output: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
    }

    await hooks["tool.execute.before"]({ tool: "edit", sessionID: "bundle-09", callID: "call-09" }, output)

    expect(output.metadata?.adaptiveStrictness).toBe("elevated")
    expect(output.args).toBeUndefined()
  })
})
