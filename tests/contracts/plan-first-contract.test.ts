import { describe, expect, it, vi } from "vitest"
import { RunLedger } from "../../src/audit/run-ledger.js"
import { setConfig } from "../../src/config.js"
import { createExecutionHooks } from "../../src/create-execution-hooks.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../src/policy/defaults.js"
import type { ThoughtRecord } from "../../src/thoughts/store.js"

describe("plan-first contract", () => {
  it("blocks without fresh plan, returns scaffold guidance, then unblocks after valid update", async () => {
    setConfig({ mode: "strict", planFirst: { enabled: true } })

    const now = Date.now()
    let thoughts: ThoughtRecord[] = []

    const hooks = createExecutionHooks({
      client: { app: { log: vi.fn().mockResolvedValue({}) } },
      directory: "/tmp/swe-bundle-12",
      runLedger: new RunLedger(),
      strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: true },
      governanceMetadata: {
        worktree: "/tmp/swe-bundle-12",
        projectID: "proj-bundle-12",
        serverUrl: "http://localhost:4096",
      },
      toolsAllowedWhileDelegating: new Set(["approval", "delegation_status"]),
      blockedCalls: new Set<string>(),
      delegationBlockedMessages: new Map<string, string>(),
      policyBlockedMessages: new Map<string, string>(),
      budgetBlockedMessages: new Map<string, string>(),
      sessionMetrics: {
        toolCalls: 0,
        filesModified: 0,
        startTime: now,
        toolUsage: new Map<string, number>(),
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
      planFirstConfig: { enabled: true, maxPlanAgeMs: 10 * 60 * 1000 },
      listThoughts: async () => thoughts,
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

    const noPlan: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
    }
    await hooks["tool.execute.before"]({ tool: "edit", sessionID: "bundle-12", callID: "call-no-plan" }, noPlan)

    expect(noPlan.args).toBeUndefined()
    expect(noPlan.metadata?.planFirstBlocked).toBe(true)
    expect(String(noPlan.output)).toContain("Next: log a 'plan:' thought")
    expect(String(noPlan.output)).toContain("Suggested plan template")
    expect(String(noPlan.output)).toContain("## Goal")

    thoughts = [
      {
        id: "stale-plan",
        title: "plan: stale",
        content: "old steps",
        createdAt: now - 20 * 60 * 1000,
      },
    ]
    const stalePlan: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
    }
    await hooks["tool.execute.before"]({ tool: "edit", sessionID: "bundle-12", callID: "call-stale" }, stalePlan)

    expect(stalePlan.args).toBeUndefined()
    expect(stalePlan.metadata?.planFirstBlocked).toBe(true)
    expect(String(stalePlan.output)).toContain("stale")
    expect(String(stalePlan.output)).toContain("## Steps")

    thoughts = [
      {
        id: "fresh-plan",
        title: "plan: safe update",
        content: "1) inspect\n2) change\n3) verify",
        createdAt: now - 1_000,
      },
    ]
    const validPlan: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
    }
    await hooks["tool.execute.before"]({ tool: "edit", sessionID: "bundle-12", callID: "call-valid" }, validPlan)

    expect(validPlan.metadata?.planFirstBlocked).not.toBe(true)
    expect(String(validPlan.output || "")).not.toContain("Plan required before")
  })
})
