import { describe, expect, it } from "vitest"
import type { SessionRunState } from "../../src/audit/run-ledger.js"
import { resolveProfile } from "../../src/config-profiles.js"
import { evaluateBudgetGate } from "../../src/policy/budgets.js"

type Tier = "poor" | "rich"
type Profile = "strict" | "balanced" | "research"

type ThroughputResult = {
  profile: Profile
  tier: Tier
  tasksPerHour: number
  passRate: number
  interruptionCount: number
}

function makeState(): SessionRunState {
  const now = Date.now()
  return {
    sessionID: "bundle-06",
    startedAt: now,
    lastUpdatedAt: now,
    toolCalls: 0,
    filesModified: 0,
    policy: {
      allow: 0,
      deny: 0,
      needsApproval: 0,
      byRisk: { low: 0, medium: 0, high: 0, critical: 0 },
    },
  }
}

function runCorpus(profile: Profile, tier: Tier): ThroughputResult {
  const resolved = resolveProfile(profile).strictControl?.budgets
  const budgets = {
    maxChangedFiles: resolved?.maxChangedFiles ?? 0,
    maxTotalLocDelta: resolved?.maxTotalLocDelta ?? 0,
    maxNewFiles: resolved?.maxNewFiles ?? 0,
    maxToolCalls: resolved?.maxToolCalls ?? 0,
  }

  const totalTasks = 120
  const mutationPeriod = tier === "poor" ? 2 : 4
  const mutationCost = tier === "poor" ? 1400 : 900
  const readCost = tier === "poor" ? 500 : 350
  const state = makeState()

  let completed = 0
  let interruptions = 0
  let elapsedMs = 0

  for (let i = 1; i <= totalTasks; i += 1) {
    const isMutation = i % mutationPeriod === 0
    const tool = isMutation ? "edit" : "read"
    const gate = evaluateBudgetGate(
      state,
      tool,
      isMutation
        ? { filePath: `src/m-${i}.ts`, oldText: "a", newText: "b" }
        : { filePath: `src/r-${i}.ts` },
      budgets
    )

    elapsedMs += isMutation ? mutationCost : readCost

    if (gate.exceeded) {
      interruptions += 1
      continue
    }

    completed += 1
    state.toolCalls += 1
    if (isMutation) {
      state.filesModified += 1
    }
  }

  return {
    profile,
    tier,
    tasksPerHour: (completed / elapsedMs) * 3_600_000,
    passRate: completed / totalTasks,
    interruptionCount: interruptions,
  }
}

describe("throughput by profile", () => {
  it("produces stable and reproducible throughput ranking by profile and tier", () => {
    const profiles: Profile[] = ["strict", "balanced", "research"]
    const tiers: Tier[] = ["poor", "rich"]

    for (const tier of tiers) {
      const runA = profiles.map((profile) => runCorpus(profile, tier))
      const runB = profiles.map((profile) => runCorpus(profile, tier))
      const runC = profiles.map((profile) => runCorpus(profile, tier))

      expect(runA).toEqual(runB)
      expect(runB).toEqual(runC)

      const strict = runA.find((result) => result.profile === "strict")
      const balanced = runA.find((result) => result.profile === "balanced")
      const research = runA.find((result) => result.profile === "research")

      expect(strict).toBeDefined()
      expect(balanced).toBeDefined()
      expect(research).toBeDefined()

      expect((research?.tasksPerHour ?? 0)).toBeGreaterThanOrEqual((balanced?.tasksPerHour ?? 0))
      expect((balanced?.tasksPerHour ?? 0)).toBeGreaterThanOrEqual((strict?.tasksPerHour ?? 0))

      expect((research?.passRate ?? 0)).toBeGreaterThanOrEqual((balanced?.passRate ?? 0))
      expect((balanced?.passRate ?? 0)).toBeGreaterThanOrEqual((strict?.passRate ?? 0))

      expect((research?.interruptionCount ?? 0)).toBeLessThanOrEqual((balanced?.interruptionCount ?? 0))
      expect((balanced?.interruptionCount ?? 0)).toBeLessThanOrEqual((strict?.interruptionCount ?? 0))
    }

    const strictPoor = runCorpus("strict", "poor")
    const strictRich = runCorpus("strict", "rich")
    expect(strictRich.tasksPerHour).toBeGreaterThan(strictPoor.tasksPerHour)
    expect(strictRich.passRate).toBeGreaterThanOrEqual(strictPoor.passRate)
  })
})
