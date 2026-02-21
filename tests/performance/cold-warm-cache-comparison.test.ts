import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { describe, expect, it, vi } from "vitest"
import { RunLedger } from "../../src/audit/run-ledger.js"
import { setConfig } from "../../src/config.js"
import { createExecutionHooks } from "../../src/create-execution-hooks.js"
import { createGovernanceTools } from "../../src/create-governance-tools.js"
import { saveDelegation } from "../../src/delegation/store.js"
import { saveThought } from "../../src/thoughts/store.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../src/policy/defaults.js"
import { SkillsRegistry } from "../../src/skills/registry.js"

function nowMs(): number {
  return Number(process.hrtime.bigint()) / 1_000_000
}

function createExecutionHarness(directory: string) {
  return createExecutionHooks({
    client: { app: { log: vi.fn().mockResolvedValue({}) } },
    directory,
    runLedger: new RunLedger(),
    strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: true },
    governanceMetadata: {
      worktree: directory,
      projectID: "proj-bundle-07",
      serverUrl: "http://localhost:4096",
    },
    toolsAllowedWhileDelegating: new Set(["approval", "delegation_status"]),
    blockedCalls: new Set<string>(),
    delegationBlockedMessages: new Map<string, string>(),
    policyBlockedMessages: new Map<string, string>(),
    budgetBlockedMessages: new Map<string, string>(),
    sessionMetrics: {
      toolCalls: 0,
      filesModified: 2,
      startTime: Date.now(),
      toolUsage: new Map<string, number>(),
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
    listThoughts: async () => [
      {
        id: "plan-1",
        title: "plan: benchmark",
        content: "keep mutation safe and incremental",
        createdAt: Date.now(),
      },
    ],
    availableAgents: new Set(["second-opinion", "code-reviewer"]),
    secondOpinionConfig: {
      enabled: true,
      minMutationsBeforeTrigger: 0,
      tier1TimeoutMs: 1000,
      tier2TimeoutMs: 1000,
      tier1Agent: "second-opinion",
      tier2Agent: "code-reviewer",
      escalateConfidenceThreshold: 0.7,
      maxEscalationsPerSession: 2,
    },
    requestSecondOpinion: async () => {
      await new Promise((resolve) => setTimeout(resolve, 2))
      return {
        verdict: "proceed",
        risks: [],
        suggestion: null,
        confidence: 0.95,
        reviewerTier: "lightweight",
      }
    },
  })
}

function createHudTools(directory: string, runLedger: RunLedger) {
  const tools = createGovernanceTools({
    runLedger,
    skillsRegistry: new SkillsRegistry(),
    strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: false },
    sessionMetrics: {
      toolCalls: 2,
      filesModified: 1,
      largeDiffDetected: false,
      failedVerificationCount: 0,
      adaptiveStrictness: "normal",
    },
    availableAgents: new Set(["build"]),
    delegationRuntime: null,
    approvalTtlMs: 60_000,
    approvalDefaultReason: "manual",
  })

  return {
    tool: tools.session_hud,
    context: {
      directory,
      sessionID: "bundle-07-session",
      messageID: "msg-bundle-07",
      agent: "build",
      worktree: directory,
      abort: new AbortController().signal,
      metadata: () => undefined,
      ask: async () => undefined,
    },
  }
}

describe("cold vs warm cache comparison", () => {
  it("shows warm-state improvement with no correctness drift", async () => {
    const coldDir = await mkdtemp(join(tmpdir(), "swe-bundle-07-cold-"))
    const warmDir = await mkdtemp(join(tmpdir(), "swe-bundle-07-warm-"))

    try {
      setConfig({ mode: "strict" })

      const coldHooks = createExecutionHarness(coldDir)
      const coldStart = nowMs()
      const coldSessionID = "bundle-07-cold-session"
      const coldFirstOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
        args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
      }
      await coldHooks["tool.execute.before"](
        { tool: "edit", sessionID: coldSessionID, callID: "cold-call-1" },
        coldFirstOutput
      )
      const coldFirstMutationMs = nowMs() - coldStart

      const warmHooks = createExecutionHarness(warmDir)
      const warmSessionID = "bundle-07-warm-session"
      await warmHooks["tool.execute.before"](
        { tool: "edit", sessionID: warmSessionID, callID: "warm-prime" },
        { args: { filePath: "src/a.ts", oldText: "a", newText: "b" } }
      )
      const warmStart = nowMs()
      const warmFirstOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
        args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
      }
      await warmHooks["tool.execute.before"](
        { tool: "edit", sessionID: warmSessionID, callID: "warm-call-1" },
        warmFirstOutput
      )
      const warmFirstMutationMs = nowMs() - warmStart

      const runLedger = new RunLedger()
      runLedger.recordToolCall("bundle-07-session")
      runLedger.recordMutation("bundle-07-session")

      const coldHud = createHudTools(coldDir, runLedger)
      const coldToolStart = nowMs()
      const coldHudOutput = await coldHud.tool.execute({}, coldHud.context)
      const coldFirstToolCallMs = nowMs() - coldToolStart

      await saveDelegation(warmDir, {
        id: "del-1",
        prompt: "benchmark",
        agent: "explore",
        createdAt: Date.now(),
        status: "running",
      })
      await saveThought(warmDir, {
        id: "thought-1",
        title: "plan: warm-cache",
        content: "existing thought/delegation history",
        createdAt: Date.now(),
      })

      const warmHud = createHudTools(warmDir, runLedger)
      const warmToolStart = nowMs()
      const warmHudOutput = await warmHud.tool.execute({}, warmHud.context)
      const warmFirstToolCallMs = nowMs() - warmToolStart

      expect(warmFirstMutationMs).toBeLessThanOrEqual(coldFirstMutationMs * 1.1)
      expect(warmFirstToolCallMs).toBeLessThan(120)
      expect(coldFirstToolCallMs).toBeLessThan(120)

      expect(coldFirstOutput.metadata?.secondOpinion).toBeDefined()
      expect(warmFirstOutput.metadata?.secondOpinion).toBeDefined()
      expect(coldFirstOutput.metadata?.secondOpinion).toEqual(warmFirstOutput.metadata?.secondOpinion)

      expect(String(coldHudOutput)).toContain("Session HUD")
      expect(String(warmHudOutput)).toContain("Session HUD")
      expect(String(coldHudOutput)).toContain("Policy:")
      expect(String(warmHudOutput)).toContain("Policy:")
      expect(String(warmHudOutput)).toContain("Delegations: running 1 | pending 0")
    } finally {
      setConfig({})
      await rm(coldDir, { recursive: true, force: true })
      await rm(warmDir, { recursive: true, force: true })
    }
  })
})
