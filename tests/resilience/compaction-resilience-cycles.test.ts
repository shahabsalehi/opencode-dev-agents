import { describe, expect, it, vi } from "vitest"
import { CompactionRescueCache } from "../../src/context/compaction-rescue.js"
import { validateCompactionOutput } from "../../src/context/compaction-validator.js"

function runCompactionCycle(
  cache: CompactionRescueCache,
  sessionID: string,
  compacted: string[]
): { restored: string[]; rescued: boolean } {
  const validation = validateCompactionOutput(compacted)
  if (validation.valid) {
    cache.captureSnapshot(sessionID, compacted)
    return { restored: compacted, rescued: false }
  }

  const rescued = cache.rescue(sessionID, compacted)
  if (rescued) {
    return { restored: rescued, rescued: true }
  }

  return { restored: compacted, rescued: false }
}

describe("compaction resilience cycles", () => {
  it("preserves valid context and governance summary over repeated cycles", () => {
    const cache = new CompactionRescueCache({ cooldownMs: 0 })
    const sessionID = "bundle-03-session"
    const governanceSummary = "## SWE Sworm Plugin Metrics\nPolicy: allow 10 | deny 0 | ask 1"
    const baseContext = [
      "## Plan\nExecute compaction safely and verify outputs.",
      governanceSummary,
      "## Notes\nDelegation and approval continuity maintained.",
    ]

    const rounds: string[][] = [
      ["## Plan\nRound 1 compaction keeps meaningful context.", governanceSummary],
      ["## Plan\nRound 2 compaction remains actionable and complete.", governanceSummary],
      ["## Plan\nRound 3 compaction retains remediation guidance clearly.", governanceSummary],
    ]

    cache.captureSnapshot(sessionID, baseContext)
    let current = baseContext

    for (const round of rounds) {
      const result = runCompactionCycle(cache, sessionID, round)
      current = result.restored
      expect(validateCompactionOutput(current).valid).toBe(true)
      expect(current.some((block) => block.includes("Policy: allow 10 | deny 0 | ask 1"))).toBe(true)
      expect(result.rescued).toBe(false)
    }
  })

  it("rescues invalid compaction output and enforces cooldown deterministically", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-17T00:00:00.000Z"))

    const cache = new CompactionRescueCache({ cooldownMs: 60_000 })
    const sessionID = "bundle-03-rescue"
    const lastGood = [
      "## Plan\nLast good context with remediation and checks.",
      "## SWE Sworm Plugin Metrics\nPolicy: allow 8 | deny 0 | ask 0",
    ]
    const invalid = ["short"]

    cache.captureSnapshot(sessionID, lastGood)
    const first = runCompactionCycle(cache, sessionID, invalid)
    expect(first.rescued).toBe(true)
    expect(first.restored).toEqual(lastGood)

    const second = runCompactionCycle(cache, sessionID, invalid)
    expect(second.rescued).toBe(false)
    expect(second.restored).toEqual(invalid)

    vi.advanceTimersByTime(61_000)
    const third = runCompactionCycle(cache, sessionID, invalid)
    expect(third.rescued).toBe(true)
    expect(third.restored).toEqual(lastGood)

    vi.useRealTimers()
  })
})
