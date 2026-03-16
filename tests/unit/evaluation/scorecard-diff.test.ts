import { describe, expect, it } from "vitest"
import { diffScorecards } from "../../../src/benchmark/scorecard-diff.js"
import type { GovernanceScorecard } from "../../../src/benchmark/types.js"

const base: GovernanceScorecard = {
  timestamp: "2026-01-01T00:00:00.000Z",
  projectID: "p",
  version: "1",
  summary: "s",
  scores: {
    governance: 8,
    apiAlignment: 8,
    architecture: 8,
    testMaturity: 8,
    sdkCorrectness: 8,
    toolBreadth: 8,
    reliability: 8,
    dxQuality: 8,
  },
}

describe("scorecard diff", () => {
  it("computes per-dimension deltas", () => {
    const next: GovernanceScorecard = {
      ...base,
      timestamp: "2026-01-02T00:00:00.000Z",
      scores: {
        ...base.scores,
        governance: 8.5,
        toolBreadth: 8.3,
      },
    }
    const diff = diffScorecards(base, next)
    expect(diff).toHaveLength(8)
    expect(diff.find((item) => item.dimension === "governance")?.delta).toBe(0.5)
    expect(diff.find((item) => item.dimension === "toolBreadth")?.delta).toBe(0.3)
  })
})
