import { describe, expect, it, vi } from "vitest"
import { RunLedger } from "../../../src/audit/run-ledger.js"
import { setConfig } from "../../../src/config.js"
import { createExecutionHooks } from "../../../src/create-execution-hooks.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../../src/policy/defaults.js"

type GoldScenario = {
  id: string
  expected: "proceed" | "caution" | "escalate"
  confidence: number
  capUsed?: boolean
  tier2Verdict?: "proceed" | "caution" | "escalate"
}

function createHooksForScenario(scenario: GoldScenario) {
  let tier1Calls = 0
  let tier2Calls = 0

  const hooks = createExecutionHooks({
    client: { app: { log: vi.fn().mockResolvedValue({}) } },
    directory: "/tmp/swe-bundle-15",
    runLedger: new RunLedger(),
    strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: true },
    governanceMetadata: {
      worktree: "/tmp/swe-bundle-15",
      projectID: "proj-bundle-15",
      serverUrl: "http://localhost:4096",
    },
    toolsAllowedWhileDelegating: new Set(["approval", "delegation_status"]),
    blockedCalls: new Set<string>(),
    delegationBlockedMessages: new Map<string, string>(),
    policyBlockedMessages: new Map<string, string>(),
    budgetBlockedMessages: new Map<string, string>(),
    sessionMetrics: {
      toolCalls: 0,
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
      secondOpinionEscalations: scenario.capUsed ? 2 : 0,
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
    listThoughts: async () => [
      {
        id: `plan-${scenario.id}`,
        title: `plan: ${scenario.id}`,
        content: "execute with verification evidence",
        createdAt: Date.now(),
      },
    ],
    availableAgents: new Set(["second-opinion", "code-reviewer"]),
    secondOpinionConfig: {
      enabled: true,
      minMutationsBeforeTrigger: 1,
      tier1TimeoutMs: 1000,
      tier2TimeoutMs: 1000,
      tier1Agent: "second-opinion",
      tier2Agent: "code-reviewer",
      escalateConfidenceThreshold: 0.7,
      maxEscalationsPerSession: 2,
    },
    requestSecondOpinion: async ({ tier }) => {
      if (tier === "lightweight") {
        tier1Calls += 1
        return {
          verdict: scenario.expected === "escalate" ? "escalate" : scenario.expected,
          risks: scenario.expected === "proceed" ? [] : ["risk"],
          suggestion: scenario.expected === "proceed" ? null : "review edits",
          confidence: scenario.confidence,
          reviewerTier: "lightweight",
        }
      }

      tier2Calls += 1
      return {
        verdict: scenario.tier2Verdict ?? "caution",
        risks: scenario.tier2Verdict === "proceed" ? [] : ["tier2-risk"],
        suggestion: scenario.tier2Verdict === "proceed" ? null : "narrow scope",
        confidence: 0.9,
        reviewerTier: "strong",
      }
    },
  })

  return { hooks, reads: () => ({ tier1Calls, tier2Calls }) }
}

describe("second-opinion escalation quality", () => {
  it("aligns verdict behavior to labeled gold set and respects escalation caps", async () => {
    setConfig({ mode: "strict", secondOpinion: { enabled: true, minMutationsBeforeTrigger: 1 } })

    const goldSet: GoldScenario[] = [
      { id: "proceed-direct", expected: "proceed", confidence: 0.9 },
      { id: "caution-direct", expected: "caution", confidence: 0.8 },
      { id: "escalate-low-confidence", expected: "escalate", confidence: 0.4 },
      { id: "escalate-tier2-proceed", expected: "escalate", confidence: 0.95, tier2Verdict: "proceed" },
      { id: "escalate-cap", expected: "escalate", confidence: 0.95, capUsed: true },
    ]

    let falseEscalate = 0
    let missedEscalate = 0

    for (const scenario of goldSet) {
      const harness = createHooksForScenario(scenario)
      const output: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
        args: { filePath: `src/${scenario.id}.ts`, oldText: "a", newText: "b" },
      }

      await harness.hooks["tool.execute.before"](
        { tool: "edit", sessionID: `bundle-15-${scenario.id}`, callID: `call-${scenario.id}` },
        output
      )

      const verdict = String(output.metadata?.secondOpinion ? (output.metadata?.secondOpinion as { verdict?: string }).verdict : "")
      const expectedFinal = scenario.id === "escalate-low-confidence" || scenario.id === "escalate-cap"
        ? "caution"
        : scenario.id === "escalate-tier2-proceed"
          ? "proceed"
          : scenario.expected

      if (verdict === "escalate" && expectedFinal !== "escalate") {
        falseEscalate += 1
      }
      if (verdict !== "escalate" && expectedFinal === "escalate") {
        missedEscalate += 1
      }

      expect(verdict).toBe(expectedFinal)

      const calls = harness.reads()
      if (scenario.id === "escalate-tier2-proceed") {
        expect(calls.tier2Calls).toBe(1)
      }
      if (scenario.id === "escalate-cap") {
        expect(calls.tier2Calls).toBe(0)
      }
    }

    expect(falseEscalate).toBeLessThanOrEqual(1)
    expect(missedEscalate).toBe(0)
  })
})
