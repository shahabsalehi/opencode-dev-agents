import { afterEach, describe, expect, it, vi } from "vitest"
import { ApprovalStore, approvalStore } from "../../src/approval-gates.js"
import { RunLedger } from "../../src/audit/run-ledger.js"
import { setConfig } from "../../src/config.js"
import { createExecutionHooks } from "../../src/create-execution-hooks.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../src/policy/defaults.js"

function createHooksHarness() {
  return createExecutionHooks({
    client: {
      app: {
        log: vi.fn().mockResolvedValue({}),
      },
    },
    directory: "/tmp/swe-bundle-04",
    runLedger: new RunLedger(),
    strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: true },
    governanceMetadata: {
      worktree: "/tmp/swe-bundle-04",
      projectID: "proj-bundle-04",
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
      startTime: Date.now(),
      toolUsage: new Map<string, number>(),
      largeDiffDetected: false,
      failedVerificationCount: 0,
      secondOpinionRequests: 0,
      secondOpinionCacheHits: 0,
      secondOpinionEscalations: 0,
      adaptiveStrictness: "relaxed",
    },
    featureFlags: {
      enableVerificationContract: true,
    },
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
}

describe("approval race conditions", () => {
  afterEach(() => {
    vi.useRealTimers()
    setConfig({})
  })

  it("keeps final approval state deterministic for interleaved actions", () => {
    const store = new ApprovalStore()
    const session = "bundle-04"

    store.requestApproval(session, "call-a", "edit", { filePath: "src/a.ts" })
    store.requestApproval(session, "call-b", "edit", { filePath: "src/b.ts" })

    expect(store.approve(session, "call-a", "first-approve", 60_000)).toBe(true)
    expect(store.deny(session, "call-a")).toBe(true)
    expect(store.approve(session, "call-b", "approve-b", 60_000)).toBe(true)

    expect(store.isApproved(session, "call-a")).toBe(false)
    expect(store.isApproved(session, "call-b")).toBe(true)
    expect(store.approve(session, "missing-call", "ghost", 60_000)).toBe(false)
    expect(store.deny(session, "missing-call")).toBe(false)
    expect(store.getPendingApprovals(session)).toHaveLength(0)
  })

  it("handles stale approvals deterministically and keeps approval idempotent", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-17T00:00:00.000Z"))

    const store = new ApprovalStore()
    const session = "bundle-04-stale"
    store.requestApproval(session, "call-stale", "edit", { filePath: "src/a.ts" })

    expect(store.approve(session, "call-stale", "first", 1)).toBe(true)
    expect(store.approve(session, "call-stale", "second", 1)).toBe(true)
    expect(store.isApproved(session, "call-stale")).toBe(true)

    vi.advanceTimersByTime(5)
    expect(store.isApproved(session, "call-stale")).toBe(false)
  })

  it("does not apply scoped grant from one path to a different path", () => {
    const store = new ApprovalStore()
    const session = "bundle-04-scope"
    store.requestApproval(session, "call-scope", "edit", { filePath: "src/safe/a.ts" })
    expect(store.approve(session, "call-scope", "scoped", 60_000)).toBe(true)

    expect(store.hasScopedGrant(session, "edit", { filePath: "src/safe/a.ts" })).toBe(true)
    expect(store.hasScopedGrant(session, "edit", { filePath: "src/other/b.ts" })).toBe(false)
  })

  it("applies latest valid decision to hook blocking behavior", async () => {
    setConfig({ mode: "strict", approval: { enforce: true } })
    const hooks = createHooksHarness()
    const sessionID = "bundle-04-session"
    const approvedCallID = "bundle-04-call-approved"
    const otherCallID = "bundle-04-call-other"

    const firstAttempt: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
    }
    await hooks["tool.execute.before"]({ tool: "edit", sessionID, callID: approvedCallID }, firstAttempt)

    expect(firstAttempt.args).toBeUndefined()
    expect(firstAttempt.output).toBeDefined()

    expect(approvalStore.approve(sessionID, approvedCallID, "manual", 60_000)).toBe(true)

    const approvedAttempt: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
    }
    await hooks["tool.execute.before"]({ tool: "edit", sessionID, callID: approvedCallID }, approvedAttempt)

    expect(approvedAttempt.args).toBeDefined()
    expect(approvedAttempt.output).toBeUndefined()

    const otherAttempt: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "src/b.ts", oldText: "a", newText: "b" },
    }
    await hooks["tool.execute.before"]({ tool: "edit", sessionID, callID: otherCallID }, otherAttempt)

    expect(otherAttempt.args).toBeUndefined()
    expect(otherAttempt.output).toBeDefined()
  })
})
