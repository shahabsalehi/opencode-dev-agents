import { describe, expect, it, vi } from "vitest"
import { createSessionLifecycleHooks } from "../../../src/create-session-lifecycle.js"
import { RunLedger } from "../../../src/audit/run-ledger.js"

function createHooks(enableAuthHook: boolean) {
  return createSessionLifecycleHooks({
    directory: "/tmp/swe-lifecycle-auth",
    runLedger: new RunLedger(),
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
      enableExperimentalCompaction: false,
      enableSystemTransform: false,
      enableAuthHook,
      enableCompactionRescue: false,
    },
    delegationRuntime: {
      handleSessionIdle: vi.fn().mockResolvedValue(undefined),
      handleSessionError: vi.fn().mockResolvedValue(undefined),
    },
    compactionRescueCache: null,
  })
}

describe("create session lifecycle auth", () => {
  it("registers auth hook when enabled", async () => {
    const hooks = createHooks(true)
    expect(hooks.auth).toBeDefined()

    const authHook = hooks.auth as {
      provider: string
      methods: Array<{
        type: string
        authorize?: (inputs?: Record<string, string>) => Promise<{ type: string }>
      }>
    }

    expect(authHook.provider).toBe("swe-sworm-governance")
    const authorize = authHook.methods[0]?.authorize
    const failed = await authorize?.({ apiKey: "" })
    const success = await authorize?.({ apiKey: "sk-test" })
    expect(failed?.type).toBe("failed")
    expect(success?.type).toBe("success")
  })

  it("omits auth hook when disabled", () => {
    const hooks = createHooks(false)
    expect(hooks.auth).toBeUndefined()
  })
})
