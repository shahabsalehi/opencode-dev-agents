import { describe, expect, it, vi } from "vitest"
import { createExecutionHooks } from "../../../src/create-execution-hooks.js"
import { RunLedger } from "../../../src/audit/run-ledger.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../../src/policy/defaults.js"
import { setConfig } from "../../../src/config.js"
import { AutopilotController } from "../../../src/autopilot/controller.js"

describe("create execution hooks", () => {
  it("blocks policy-denied tool and emits metadata", async () => {
    setConfig({ mode: "strict", strictControl: { recordOnly: false } })

    const runLedger = new RunLedger()
    const hooks = createExecutionHooks({
      client: {
        app: {
          log: vi.fn().mockResolvedValue({}),
        },
      },
      directory: "/tmp/swe-exec-hooks",
      runLedger,
      strictPolicy: {
        ...DEFAULT_STRICT_CONTROL_POLICY,
        recordOnly: false,
        mcp: {
          enabled: true,
          allowlist: [],
          denylist: ["mcp.server.danger"],
          capabilityRules: [],
        },
      },
      governanceMetadata: {
        worktree: "/tmp/swe-exec-hooks",
        projectID: "proj-exec",
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

    const beforeOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { anything: true },
    }

    await hooks["tool.execute.before"](
      {
        tool: "mcp.server.danger",
        sessionID: "ses-exec",
        callID: "call-exec-1",
      },
      beforeOutput
    )

    expect(beforeOutput.args).toBeUndefined()
    expect(String(beforeOutput.output)).toContain("Policy blocked")
    expect(beforeOutput.metadata?.policyBlocked).toBe(true)
  })

  it("records mutation metadata and verification hints", async () => {
    setConfig({ mode: "strict", verification: { enforceOnMutation: true } })

    const hooks = createExecutionHooks({
      client: {
        app: {
          log: vi.fn().mockResolvedValue({}),
        },
      },
      directory: "/tmp/swe-exec-hooks",
      runLedger: new RunLedger(),
      strictPolicy: {
        ...DEFAULT_STRICT_CONTROL_POLICY,
        recordOnly: false,
      },
      governanceMetadata: {
        worktree: "/tmp/swe-exec-hooks",
        projectID: "proj-exec",
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
      readSessionDiffSummary: async () => ({ files: 1, additions: 2, deletions: 1 }),
      readTodoPressure: async () => ({ pending: 1, inProgress: 0, total: 1 }),
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

    const afterOutput: { output?: unknown; title?: string; metadata?: Record<string, unknown> } = {
      output: { files: ["a.ts"] },
    }

    await hooks["tool.execute.after"](
      {
        tool: "edit",
        sessionID: "ses-exec-2",
        callID: "call-exec-2",
        args: { filePath: "a.ts", oldText: "a", newText: "b" },
      },
      afterOutput
    )

    expect(afterOutput.metadata?.governanceInsights).toBeDefined()
    expect(afterOutput.metadata?.verificationVerdict).toBeDefined()
  })

  it("blocks risky tool when plan-first is enabled and no plan exists", async () => {
    setConfig({ mode: "strict", planFirst: { enabled: true } })

    const hooks = createExecutionHooks({
      client: { app: { log: vi.fn().mockResolvedValue({}) } },
      directory: "/tmp/swe-exec-hooks",
      runLedger: new RunLedger(),
      strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: false },
      governanceMetadata: {
        worktree: "/tmp/swe-exec-hooks",
        projectID: "proj-exec",
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
        toolUsage: new Map(),
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
      planFirstConfig: { enabled: true, maxPlanAgeMs: 30 * 60 * 1000 },
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

    const beforeOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "x" },
    }
    await hooks["tool.execute.before"]({ tool: "edit", sessionID: "s", callID: "c" }, beforeOutput)
    expect(beforeOutput.args).toBeUndefined()
    expect(beforeOutput.metadata?.planFirstBlocked).toBe(true)
  })

  it("adds second-opinion metadata for risky mutation", async () => {
    setConfig({
      mode: "strict",
      secondOpinion: {
        enabled: true,
        minMutationsBeforeTrigger: 0,
      },
    })

    const hooks = createExecutionHooks({
      client: { app: { log: vi.fn().mockResolvedValue({}) } },
      directory: "/tmp/swe-exec-hooks",
      runLedger: new RunLedger(),
      strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: false },
      governanceMetadata: {
        worktree: "/tmp/swe-exec-hooks",
        projectID: "proj-exec",
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
        toolUsage: new Map(),
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
      planFirstConfig: { enabled: true, maxPlanAgeMs: 30 * 60 * 1000 },
      listThoughts: async () => [{ id: "p1", title: "plan: test", content: "do safe edit", createdAt: Date.now() }],
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
      requestSecondOpinion: async () => ({
        verdict: "caution",
        risks: ["possible drift"],
        suggestion: "keep patch minimal",
        confidence: 0.7,
        reviewerTier: "lightweight",
      }),
    })

    const beforeOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "x.ts", oldText: "a", newText: "b" },
    }
    await hooks["tool.execute.before"]({ tool: "edit", sessionID: "s-op", callID: "c-op" }, beforeOutput)
    expect(beforeOutput.metadata?.secondOpinion).toBeDefined()
    expect(beforeOutput.args).toBeUndefined()
  })

  it("forces approval for risky mutation under adaptive elevated pressure", async () => {
    setConfig({
      mode: "research",
      approval: { enforce: false },
      strictControl: {
        adaptive: { enabled: true },
      },
      secondOpinion: {
        enabled: false,
      },
    })

    const hooks = createExecutionHooks({
      client: { app: { log: vi.fn().mockResolvedValue({}) } },
      directory: "/tmp/swe-exec-hooks",
      runLedger: new RunLedger(),
      strictPolicy: {
        ...DEFAULT_STRICT_CONTROL_POLICY,
        recordOnly: true,
        adaptive: { enabled: true },
      },
      governanceMetadata: {
        worktree: "/tmp/swe-exec-hooks",
        projectID: "proj-exec",
        serverUrl: "http://localhost:4096",
      },
      toolsAllowedWhileDelegating: new Set(["approval", "delegation_status"]),
      blockedCalls: new Set<string>(),
      delegationBlockedMessages: new Map<string, string>(),
      policyBlockedMessages: new Map<string, string>(),
      budgetBlockedMessages: new Map<string, string>(),
      sessionMetrics: {
        toolCalls: 10,
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
      listThoughts: async () => [{ id: "p1", title: "plan: safe", content: "step", createdAt: Date.now() }],
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

    const beforeOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "x.ts", oldText: "a", newText: "b" },
    }
    await hooks["tool.execute.before"]({ tool: "edit", sessionID: "ses-adapt", callID: "call-adapt" }, beforeOutput)
    expect(beforeOutput.args).toBeUndefined()
    expect(beforeOutput.metadata?.adaptiveStrictness).toBe("elevated")
  })

  it("emits budget advisory without hard block in balanced mode", async () => {
    setConfig({ mode: "balanced" })

    const hooks = createExecutionHooks({
      client: { app: { log: vi.fn().mockResolvedValue({}) } },
      directory: "/tmp/swe-exec-hooks",
      runLedger: new RunLedger(),
      strictPolicy: {
        ...DEFAULT_STRICT_CONTROL_POLICY,
        recordOnly: false,
        budgets: {
          maxChangedFiles: 0,
          maxTotalLocDelta: 1,
          maxNewFiles: 1,
          maxToolCalls: 0,
        },
      },
      governanceMetadata: {
        worktree: "/tmp/swe-exec-hooks",
        projectID: "proj-exec",
        serverUrl: "http://localhost:4096",
      },
      toolsAllowedWhileDelegating: new Set(["approval", "delegation_status"]),
      blockedCalls: new Set<string>(),
      delegationBlockedMessages: new Map<string, string>(),
      policyBlockedMessages: new Map<string, string>(),
      budgetBlockedMessages: new Map<string, string>(),
      sessionMetrics: {
        toolCalls: 1,
        filesModified: 1,
        startTime: Date.now(),
        toolUsage: new Map([["edit", 1]]),
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
      listThoughts: async () => [{ id: "p1", title: "plan: safe", content: "step", createdAt: Date.now() }],
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

    const beforeOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "x.ts", oldText: "a", newText: "b" },
    }
    await hooks["tool.execute.before"]({ tool: "edit", sessionID: "ses-budget", callID: "call-budget" }, beforeOutput)
    expect(beforeOutput.args).toBeDefined()
    expect(String(beforeOutput.output)).toContain("Budget advisory")
    expect(beforeOutput.metadata?.budgetAdvisory).toBe(true)
  })

  it("pauses mutation tools in autopilot when cumulative risk threshold is reached", async () => {
    setConfig({ mode: "autopilot", strictControl: { recordOnly: false } })

    const controller = new AutopilotController(1, 10)
    controller.startStep("ses-auto", "edit")
    controller.completeStep("ses-auto", 1)

    const hooks = createExecutionHooks({
      client: { app: { log: vi.fn().mockResolvedValue({}) } },
      directory: "/tmp/swe-exec-hooks",
      runLedger: new RunLedger(),
      strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: false },
      governanceMetadata: {
        worktree: "/tmp/swe-exec-hooks",
        projectID: "proj-exec",
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
        toolUsage: new Map(),
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
      autopilotController: controller,
    })

    const beforeOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { command: "npm test" },
    }

    await hooks["tool.execute.before"]({ tool: "bash", sessionID: "ses-auto", callID: "call-auto" }, beforeOutput)

    expect(beforeOutput.args).toBeUndefined()
    expect(beforeOutput.metadata?.autopilotPaused).toBe(true)
  })
})
