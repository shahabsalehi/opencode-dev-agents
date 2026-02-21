import { describe, expect, it, vi } from "vitest"
import { RunLedger } from "../../../src/audit/run-ledger.js"
import { setConfig } from "../../../src/config.js"
import { createExecutionHooks } from "../../../src/create-execution-hooks.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../../src/policy/defaults.js"

describe("verification loop stability", () => {
  it("converges from repeated needs-review to terminal pass within bounded retries", async () => {
    setConfig({ mode: "strict", verification: { enforceOnMutation: true } })

    const sessionMetrics = {
      toolCalls: 0,
      filesModified: 0,
      startTime: Date.now(),
      toolUsage: new Map<string, number>(),
      largeDiffDetected: false,
      failedVerificationCount: 0,
      secondOpinionRequests: 0,
      secondOpinionCacheHits: 0,
      secondOpinionEscalations: 0,
      adaptiveStrictness: "normal" as const,
    }

    const hooks = createExecutionHooks({
      client: { app: { log: vi.fn().mockResolvedValue({}) } },
      directory: "/tmp/swe-bundle-16",
      runLedger: new RunLedger(),
      strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: true },
      governanceMetadata: {
        worktree: "/tmp/swe-bundle-16",
        projectID: "proj-bundle-16",
        serverUrl: "http://localhost:4096",
      },
      toolsAllowedWhileDelegating: new Set(["approval", "delegation_status"]),
      blockedCalls: new Set<string>(),
      delegationBlockedMessages: new Map<string, string>(),
      policyBlockedMessages: new Map<string, string>(),
      budgetBlockedMessages: new Map<string, string>(),
      sessionMetrics,
      featureFlags: { enableVerificationContract: true },
      approvalTtlMs: 60_000,
      approvalDefaultReason: "manual",
      delegationRuntime: null,
      readSessionDiffSummary: async () => ({ files: 2, additions: 8, deletions: 4 }),
      readTodoPressure: async () => ({ pending: 1, inProgress: 1, total: 2 }),
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

    const verdicts: string[] = []
    let loops = 0
    for (let i = 0; i < 3; i += 1) {
      const out: { output?: unknown; title?: string; metadata?: Record<string, unknown> } = { output: "mutation done" }
      await hooks["tool.execute.after"](
        {
          tool: "edit",
          sessionID: "bundle-16",
          callID: `loop-${i}`,
          args: { filePath: `src/a-${i}.ts`, oldText: "a", newText: "b" },
        },
        out
      )

      verdicts.push(String(out.metadata?.verificationVerdict))
      expect(String(out.output)).toContain("Verification contract")
      loops += 1
    }

    const remediated: { output?: unknown; title?: string; metadata?: Record<string, unknown> } = { output: "mutation done" }
    await hooks["tool.execute.after"](
      {
        tool: "edit",
        sessionID: "bundle-16",
        callID: "loop-remediated",
        args: {
          filePath: "src/final.ts",
          oldText: "a",
          newText: "b",
          verificationEvidence: { typecheck: true, tests: true, build: true },
        },
      },
      remediated
    )

    verdicts.push(String(remediated.metadata?.verificationVerdict))

    expect(loops).toBeLessThanOrEqual(3)
    expect(verdicts.slice(0, 3).every((verdict) => verdict === "needs-review")).toBe(true)
    expect(verdicts[3]).toBe("pass")
    expect(remediated.metadata?.verificationReason).toContain("mutation-verification-evidence-complete")
    expect(String(remediated.output)).not.toContain("Verification contract")
    expect(remediated.metadata?.normalizedOutput).toBeDefined()
    expect(sessionMetrics.failedVerificationCount).toBe(3)
  })
})
