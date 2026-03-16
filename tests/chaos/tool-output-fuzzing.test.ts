import { describe, expect, it, vi } from "vitest"
import { RunLedger } from "../../src/audit/run-ledger.js"
import { setConfig } from "../../src/config.js"
import { createExecutionHooks } from "../../src/create-execution-hooks.js"
import { normalizeToolOutput } from "../../src/normalization/tool-output.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../src/policy/defaults.js"

describe("tool output fuzzing", () => {
  it("keeps a stable normalization envelope across malformed mixed outputs", () => {
    const fuzzedOutputs: unknown[] = [
      "{\"status\":\"ok\"",
      "warning: partial payload\n{\"incomplete\":true",
      "x".repeat(12000),
      "",
      42,
      null,
      undefined,
      [],
      ["nested", { deep: [1, 2, 3] }],
      {},
      { nested: { level: { flag: true } }, unknown: ["a", 1, null] },
      { metadata: { unexpected: true }, output: "ok" },
    ]

    for (const output of fuzzedOutputs) {
      const normalized = normalizeToolOutput("reviewTool", output, {})
      expect(normalized).toEqual(
        expect.objectContaining({
          status: expect.any(String),
          tool: "reviewTool",
          summary: expect.any(String),
        })
      )
      expect(["ok", "warning", "blocked"]).toContain(normalized.status)
      expect(normalized.summary.length).toBeLessThanOrEqual(243)
    }
  })

  it("does not crash after-hook metadata normalization on malformed outputs", async () => {
    setConfig({ mode: "strict", verification: { enforceOnMutation: true } })

    const hooks = createExecutionHooks({
      client: { app: { log: vi.fn().mockResolvedValue({}) } },
      directory: "/tmp/swe-bundle-21",
      runLedger: new RunLedger(),
      strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: true },
      governanceMetadata: {
        worktree: "/tmp/swe-bundle-21",
        projectID: "proj-bundle-21",
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
        adaptiveStrictness: "normal",
      },
      featureFlags: { enableVerificationContract: true },
      approvalTtlMs: 60000,
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

    const malformedOutputs: unknown[] = [
      "{\"summary\":",
      "warning\n\n{not-json}",
      { deeply: { nested: { unknown: true } } },
      [1, 2, { n: "x" }],
      "x".repeat(10000),
      "",
    ]

    for (const [index, payload] of malformedOutputs.entries()) {
      const output: { output?: unknown; title?: string; metadata?: Record<string, unknown> } = {
        output: payload,
        metadata: { unexpectedField: { index } },
      }

      await expect(
        hooks["tool.execute.after"]?.(
          {
            tool: "reviewTool",
            sessionID: "bundle-21-session",
            callID: `bundle-21-call-${index}`,
            args: { scope: "src" },
          },
          output as never
        )
      ).resolves.toBeUndefined()

      expect(output.metadata?.normalizedOutput).toEqual(
        expect.objectContaining({
          tool: "reviewTool",
          status: expect.any(String),
          summary: expect.any(String),
        })
      )
      expect(output.metadata?.verificationVerdict).toBeTypeOf("string")
      expect(output.metadata?.verificationReason).toBeTypeOf("string")
    }
  })
})
