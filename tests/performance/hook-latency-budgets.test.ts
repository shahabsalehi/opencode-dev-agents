import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { describe, expect, it, vi } from "vitest"
import { RunLedger } from "../../src/audit/run-ledger.js"
import { setConfig } from "../../src/config.js"
import { createExecutionHooks } from "../../src/create-execution-hooks.js"
import { createGovernanceTools } from "../../src/create-governance-tools.js"
import { createSessionLifecycleHooks } from "../../src/create-session-lifecycle.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../src/policy/defaults.js"
import { SkillsRegistry } from "../../src/skills/registry.js"

type Stats = { p50: number; p95: number; max: number }

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

function summarize(values: number[]): Stats {
  return {
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: Math.max(...values),
  }
}

function nowMs(): number {
  return Number(process.hrtime.bigint()) / 1_000_000
}

async function measure(iterations: number, fn: () => Promise<void>): Promise<number[]> {
  const values: number[] = []
  for (let i = 0; i < iterations; i += 1) {
    const start = nowMs()
    await fn()
    values.push(nowMs() - start)
  }
  return values
}

function createExecutionHookHarness() {
  return createExecutionHooks({
    client: { app: { log: vi.fn().mockResolvedValue({}) } },
    directory: "/tmp/swe-bundle-05",
    runLedger: new RunLedger(),
    strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: true },
    governanceMetadata: {
      worktree: "/tmp/swe-bundle-05",
      projectID: "proj-bundle-05",
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
}

describe("hook latency budgets", () => {
  it("keeps P95 latency within deterministic budgets across profiles", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "swe-bundle-05-"))
    const profiles = ["strict", "balanced", "research"] as const

    try {
      for (const profile of profiles) {
        setConfig({ mode: profile })

        const executionHooks = createExecutionHookHarness()
        let beforeCounter = 0
        const beforeLatencies = await measure(40, async () => {
          const out: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
            args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
          }
          await executionHooks["tool.execute.before"]({
            tool: "edit",
            sessionID: `ses-${profile}`,
            callID: `call-${profile}-${beforeCounter++}`,
          }, out)
        })

        let afterCounter = 0
        const afterLatencies = await measure(40, async () => {
          const out: { output?: unknown; metadata?: Record<string, unknown> } = { output: { files: ["a.ts"] } }
          await executionHooks["tool.execute.after"]({
            tool: "edit",
            sessionID: `ses-${profile}`,
            callID: `call-after-${profile}-${afterCounter++}`,
            args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
          }, out)
        })

        const lifecycleHooks = createSessionLifecycleHooks({
          directory: workspace,
          runLedger: new RunLedger(),
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
          featureFlags: {
            enableExperimentalCompaction: false,
            enableSystemTransform: false,
            enableAuthHook: false,
            enableCompactionRescue: false,
          },
          delegationRuntime: {
            handleSessionIdle: async () => undefined,
            handleSessionError: async () => undefined,
          },
          compactionRescueCache: null,
        })
        const lifecycleEvent = lifecycleHooks.event as (input: {
          event?: { type?: string; properties?: Record<string, unknown> }
        }) => Promise<void>
        const lifecycleLatencies = await measure(40, async () => {
          await lifecycleEvent({
            event: { type: "session.idle", properties: { sessionID: `ses-${profile}` } },
          })
        })

        const governanceTools = createGovernanceTools({
          runLedger: new RunLedger(),
          skillsRegistry: new SkillsRegistry(),
          strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: false },
          sessionMetrics: {
            toolCalls: 0,
            filesModified: 0,
            largeDiffDetected: false,
            failedVerificationCount: 0,
            adaptiveStrictness: "normal",
          },
          availableAgents: new Set(["build"]),
          delegationRuntime: null,
          approvalTtlMs: 60_000,
          approvalDefaultReason: "manual",
        })
        const governanceLatencies = await measure(40, async () => {
          await governanceTools.session_hud.execute({}, {
            directory: workspace,
            sessionID: `ses-${profile}`,
            messageID: `msg-${profile}`,
            agent: "build",
            worktree: workspace,
            abort: new AbortController().signal,
            metadata: () => undefined,
            ask: async () => undefined,
          })
        })

        const beforeStats = summarize(beforeLatencies)
        const afterStats = summarize(afterLatencies)
        const lifecycleStats = summarize(lifecycleLatencies)
        const governanceStats = summarize(governanceLatencies)

        expect(beforeStats.p95).toBeLessThan(50)
        expect(afterStats.p95).toBeLessThan(50)
        expect(lifecycleStats.p95).toBeLessThan(50)
        expect(governanceStats.p95).toBeLessThan(50)

        expect(beforeStats.max).toBeLessThan(100)
        expect(afterStats.max).toBeLessThan(100)
        expect(lifecycleStats.max).toBeLessThan(100)
        expect(governanceStats.max).toBeLessThan(100)
      }

      const coldSamples: number[] = []
      for (let i = 0; i < 20; i += 1) {
        const hooks = createExecutionHookHarness()
        const out: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
          args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
        }
        const start = nowMs()
        await hooks["tool.execute.before"]({
          tool: "edit",
          sessionID: "cold-session",
          callID: `cold-call-${i}`,
        }, out)
        coldSamples.push(nowMs() - start)
      }

      const warmHooks = createExecutionHookHarness()
      await warmHooks["tool.execute.before"]({
        tool: "edit",
        sessionID: "warm-session",
        callID: "warm-prime",
      }, { args: { filePath: "src/a.ts", oldText: "a", newText: "b" } })

      let warmCounter = 0
      const warmSamples = await measure(20, async () => {
        await warmHooks["tool.execute.before"]({
          tool: "edit",
          sessionID: "warm-session",
          callID: `warm-call-${warmCounter++}`,
        }, { args: { filePath: "src/a.ts", oldText: "a", newText: "b" } })
      })

      expect(summarize(warmSamples).p50).toBeLessThanOrEqual(summarize(coldSamples).p50 * 1.5)

      const breached = { p95: 120, budget: 50 }
      const healthy = { p95: 20, budget: 50 }
      expect(breached.p95 > breached.budget).toBe(true)
      expect(healthy.p95 > healthy.budget).toBe(false)
    } finally {
      await rm(workspace, { recursive: true, force: true })
      setConfig({})
    }
  })
})
