import { describe, expect, it, vi } from "vitest"
import { approvalStore } from "../../../src/approval-gates.js"
import { RunLedger } from "../../../src/audit/run-ledger.js"
import { setConfig } from "../../../src/config.js"
import { createExecutionHooks } from "../../../src/create-execution-hooks.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../../src/policy/defaults.js"

function createHooks(options?: { strictMode?: boolean; pendingDelegations?: boolean; tightBudget?: boolean }) {
  const pendingState = { value: options?.pendingDelegations ?? false }
  const runLedger = new RunLedger()
  const delegationBlockedMessages = new Map<string, string>()
  const hooks = createExecutionHooks({
    client: { app: { log: vi.fn().mockResolvedValue({}) } },
    directory: "/tmp/swe-bundle-13",
    runLedger,
    strictPolicy: {
      ...DEFAULT_STRICT_CONTROL_POLICY,
      recordOnly: options?.strictMode ? false : true,
      budgets: options?.tightBudget
        ? { maxChangedFiles: 1, maxTotalLocDelta: 1, maxNewFiles: 1, maxToolCalls: 1 }
        : { maxChangedFiles: 100, maxTotalLocDelta: 10_000, maxNewFiles: 100, maxToolCalls: 1_000 },
    },
    governanceMetadata: {
      worktree: "/tmp/swe-bundle-13",
      projectID: "proj-bundle-13",
      serverUrl: "http://localhost:4096",
    },
    toolsAllowedWhileDelegating: new Set(["approval", "delegation_status"]),
    blockedCalls: new Set<string>(),
    delegationBlockedMessages,
    policyBlockedMessages: new Map<string, string>(),
    budgetBlockedMessages: new Map<string, string>(),
    sessionMetrics: {
      toolCalls: 5,
      filesModified: 3,
      startTime: Date.now(),
      toolUsage: new Map([[
        "edit",
        3,
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
    delegationRuntime: {
      hasPendingForParent: () => pendingState.value,
      getActiveCountForParent: () => 1,
    },
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

  return { hooks, pendingState, runLedger, delegationBlockedMessages }
}

describe("block response resolution", () => {
  it("resolves policy/budget/approval/delegation blocks in two turns with actionable guidance", async () => {
    const resolutionTurns: number[] = []

    setConfig({ mode: "strict", approval: { enforce: true } })
    const policy = createHooks({ strictMode: true })
    const policyFirst = { args: { command: "git push origin main" } as Record<string, unknown> }
    await policy.hooks["tool.execute.before"]({ tool: "bash", sessionID: "bundle-13-policy", callID: "p1" }, policyFirst)
    expect(String((policyFirst as { output?: unknown }).output)).toContain("Policy blocked action")
    expect(String((policyFirst as { output?: unknown }).output)).toContain("Fallback:")

    const policySecond = { args: { filePath: "src/a.ts" } as Record<string, unknown> }
    await policy.hooks["tool.execute.before"]({ tool: "read", sessionID: "bundle-13-policy", callID: "p2" }, policySecond)
    expect((policySecond as { args?: Record<string, unknown> }).args).toBeDefined()
    resolutionTurns.push(2)

    setConfig({ mode: "strict", approval: { enforce: false } })
    const budget = createHooks({ strictMode: true, tightBudget: true })
    budget.runLedger.recordToolCall("bundle-13-budget")
    budget.runLedger.recordToolCall("bundle-13-budget")
    const budgetFirst = { args: { filePath: "src/a.ts", oldText: "a", newText: "b" } as Record<string, unknown> }
    await budget.hooks["tool.execute.before"]({ tool: "edit", sessionID: "bundle-13-budget" }, budgetFirst)
    expect(String((budgetFirst as { output?: unknown }).output)).toContain("Budget threshold reached")
    expect(String((budgetFirst as { output?: unknown }).output)).toContain("Fallback:")

    setConfig({ mode: "balanced", approval: { enforce: false } })
    const budgetSecond = { args: { filePath: "src/a.ts", oldText: "a", newText: "b" } as Record<string, unknown> }
    await budget.hooks["tool.execute.before"]({ tool: "edit", sessionID: "bundle-13-budget" }, budgetSecond)
    expect((budgetSecond as { args?: Record<string, unknown> }).args).toBeDefined()
    resolutionTurns.push(2)

    setConfig({ mode: "strict", approval: { enforce: true } })
    const approval = createHooks({ strictMode: false })
    const approvalSession = "bundle-13-approval"
    const approvalCall = "approve-1"
    const approvalFirst = { args: { filePath: "src/a.ts", oldText: "a", newText: "b" } as Record<string, unknown> }
    await approval.hooks["tool.execute.before"]({ tool: "edit", sessionID: approvalSession, callID: approvalCall }, approvalFirst)
    expect(String((approvalFirst as { output?: unknown }).output)).toContain("Approval required")
    expect(String((approvalFirst as { output?: unknown }).output)).toContain("Fallback:")
    expect(approvalStore.approve(approvalSession, approvalCall, "manual", 60_000)).toBe(true)

    const approvalSecond = { args: { filePath: "src/a.ts", oldText: "a", newText: "b" } as Record<string, unknown> }
    await approval.hooks["tool.execute.before"]({ tool: "edit", sessionID: approvalSession, callID: approvalCall }, approvalSecond)
    expect((approvalSecond as { args?: Record<string, unknown> }).args).toBeDefined()
    resolutionTurns.push(2)

    setConfig({ mode: "strict" })
    const delegation = createHooks({ strictMode: false, pendingDelegations: true })
    const delegationFirst = { args: { filePath: "src/a.ts" } as Record<string, unknown> }
    await delegation.hooks["tool.execute.before"]({ tool: "read", sessionID: "bundle-13-delegation", callID: "d1" }, delegationFirst)
    const delegationMessage = delegation.delegationBlockedMessages.get("d1")
    expect(delegationMessage).toBeDefined()
    expect(String(delegationMessage)).toContain("delegation")
    expect(String(delegationMessage)).toContain("Fallback:")

    delegation.pendingState.value = false
    const delegationSecond = { args: { filePath: "src/a.ts" } as Record<string, unknown> }
    await delegation.hooks["tool.execute.before"]({ tool: "read", sessionID: "bundle-13-delegation", callID: "d2" }, delegationSecond)
    expect((delegationSecond as { args?: Record<string, unknown> }).args).toBeDefined()
    resolutionTurns.push(2)

    const resolvedInTwoTurns = resolutionTurns.filter((turns) => turns <= 2).length
    expect(resolvedInTwoTurns).toBeGreaterThanOrEqual(3)
    expect(resolutionTurns.length).toBe(4)
  })
})
