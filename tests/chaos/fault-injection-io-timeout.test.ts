import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { describe, expect, it, vi } from "vitest"
import { RunLedger } from "../../src/audit/run-ledger.js"
import { createExecutionHooks } from "../../src/create-execution-hooks.js"
import { DelegationRuntime, buildDelegationRecord } from "../../src/delegation/runtime.js"
import { listDelegations, saveDelegation } from "../../src/delegation/store.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../src/policy/defaults.js"

describe("fault injection (io and timeout)", () => {
  it("degrades gracefully when after-hook hits read/write timeout faults", async () => {
    const log = vi.fn().mockResolvedValue({})
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
      client: { app: { log } },
      directory: "/tmp/swe-bundle-22",
      runLedger: new RunLedger(),
      strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: true },
      governanceMetadata: {
        worktree: "/tmp/swe-bundle-22",
        projectID: "proj-bundle-22",
        serverUrl: "http://localhost:4096",
      },
      toolsAllowedWhileDelegating: new Set(["approval", "delegation_status"]),
      blockedCalls: new Set<string>(),
      delegationBlockedMessages: new Map<string, string>(),
      policyBlockedMessages: new Map<string, string>(),
      budgetBlockedMessages: new Map<string, string>(),
      sessionMetrics,
      featureFlags: { enableVerificationContract: true },
      approvalTtlMs: 60000,
      approvalDefaultReason: "manual",
      delegationRuntime: null,
      readSessionDiffSummary: async () => {
        throw new Error("EIO read timeout")
      },
      readTodoPressure: async () => {
        throw new Error("EIO todo timeout")
      },
      saveRunLedgerSnapshot: async () => {
        throw new Error("EIO write timeout")
      },
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

    const output: { output?: unknown; title?: string; metadata?: Record<string, unknown> } = {
      output: "ok",
    }

    await expect(
      hooks["tool.execute.after"]?.(
        {
          tool: "edit",
          sessionID: "bundle-22-session",
          callID: "bundle-22-call",
          args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
        },
        output as never
      )
    ).resolves.toBeUndefined()

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          level: "error",
          message: "Tool execution after hook error",
        }),
      })
    )
    expect(sessionMetrics.filesModified).toBe(0)
  })

  it("preserves delegation invariants under partial completion and timeout faults", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swe-bundle-22-"))

    try {
      await saveDelegation(directory, buildDelegationRecord({ id: "del-ok", prompt: "ok", agent: "explore" }))
      await saveDelegation(directory, buildDelegationRecord({ id: "del-timeout", prompt: "timeout", agent: "explore" }))

      let nextSessionID = 0
      const runtime = new DelegationRuntime(
        {
          session: {
            async create() {
              nextSessionID += 1
              return { data: { id: `child-${nextSessionID}` } }
            },
            async prompt() {
              return {}
            },
            async messages(args) {
              if (args.path.id === "child-2") {
                throw new Error("socket timeout while reading delegated messages")
              }
              return {
                data: [
                  {
                    info: { role: "assistant" },
                    parts: [{ type: "text", text: "delegation complete" }],
                  },
                ],
              }
            },
          },
          app: {
            async log() {
              return {}
            },
          },
        },
        directory
      )

      const first = await runtime.start({
        delegationID: "del-ok",
        prompt: "ok",
        agent: "explore",
        parentSessionID: "parent-22",
        parentAgent: "build",
      })
      const second = await runtime.start({
        delegationID: "del-timeout",
        prompt: "timeout",
        agent: "explore",
        parentSessionID: "parent-22",
        parentAgent: "build",
      })

      await runtime.handleSessionIdle(first.sessionID)

      await expect(runtime.handleSessionIdle(second.sessionID)).rejects.toThrow("socket timeout")
      await runtime.handleSessionError(second.sessionID, "timeout exceeded")

      const records = await listDelegations(directory)
      const ok = records.find((item) => item.id === "del-ok")
      const timedOut = records.find((item) => item.id === "del-timeout")

      expect(ok?.status).toBe("completed")
      expect(timedOut?.status).toBe("error")
      expect(runtime.hasPendingForParent("parent-22")).toBe(false)
      expect(runtime.getActiveCountForParent("parent-22")).toBe(0)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
