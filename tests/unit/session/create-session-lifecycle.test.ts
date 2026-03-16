import { mkdtemp, mkdir, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { describe, expect, it, vi } from "vitest"
import { createSessionLifecycleHooks } from "../../../src/create-session-lifecycle.js"
import { RunLedger } from "../../../src/audit/run-ledger.js"
import { CompactionRescueCache } from "../../../src/context/compaction-rescue.js"

describe("create session lifecycle hooks", () => {
  it("builds compaction and system transform context", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swe-lifecycle-"))
    const contextDir = join(directory, ".opencode", "context", "core")
    await mkdir(contextDir, { recursive: true })
    await writeFile(join(contextDir, "quality.md"), "alpha\nbeta\ngamma", "utf-8")

    const delegationRuntime = {
      handleSessionIdle: vi.fn().mockResolvedValue(undefined),
      handleSessionError: vi.fn().mockResolvedValue(undefined),
    }

    const hooks = createSessionLifecycleHooks({
      directory,
      runLedger: new RunLedger(),
      sessionMetrics: {
        toolCalls: 2,
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
      featureFlags: {
        enableExperimentalCompaction: true,
        enableSystemTransform: true,
        enableAuthHook: false,
        enableCompactionRescue: false,
      },
      delegationRuntime,
      compactionRescueCache: null,
    })

    const compactOutput = { context: [] as string[] }
    await (hooks["experimental.session.compacting"] as (
      input: { sessionID: string },
      output: { context: string[] }
    ) => Promise<void>)({ sessionID: `ses-life-${Date.now()}` }, compactOutput)
    expect(compactOutput.context[0]).toContain("SWE Sworm Plugin Metrics")

    const systemOutput = { system: [] as string[] }
    await (hooks["experimental.chat.system.transform"] as (
      input: unknown,
      output: { system: string[] }
    ) => Promise<void>)({}, systemOutput)
    expect(systemOutput.system.length).toBeGreaterThan(0)

    const toolDefOutput = { description: "Analyze code" }
    await (hooks["tool.definition"] as (
      input: { toolID?: string },
      output: { description: string }
    ) => Promise<void>)({ toolID: "codeAnalyzer" }, toolDefOutput)
    expect(toolDefOutput.description).toContain("SWE Sworm")

    await (hooks.event as (input: { event?: { type?: string; properties?: Record<string, unknown> } }) => Promise<void>)(
      { event: { type: "session.idle", properties: { sessionID: "s1" } } }
    )
    expect(delegationRuntime.handleSessionIdle).toHaveBeenCalledWith("s1")

    await rm(directory, { recursive: true, force: true })
  })

  it("rescues invalid compaction output when enabled", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swe-lifecycle-rescue-"))
    const rescueCache = new CompactionRescueCache({ cooldownMs: 0 })
    rescueCache.captureSnapshot("ses-r", ["restored snapshot block with meaningful content"])

    const hooks = createSessionLifecycleHooks({
      directory,
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
        enableExperimentalCompaction: true,
        enableSystemTransform: false,
        enableAuthHook: false,
        enableCompactionRescue: true,
      },
      delegationRuntime: null,
      compactionRescueCache: rescueCache,
    })

    const output = { context: ["x"] }
    await (hooks["experimental.session.compacting"] as (
      input: { sessionID: string },
      out: { context: string[] }
    ) => Promise<void>)({ sessionID: "ses-r" }, output)

    expect(output.context.join("\n")).toContain("restored snapshot block")
    await rm(directory, { recursive: true, force: true })
  })
})
