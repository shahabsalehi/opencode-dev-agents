import { describe, expect, it } from "vitest"
import { computeStepRisk, shouldAutoPause } from "../../../src/autopilot/risk-accumulator.js"

describe("risk accumulator", () => {
  it("computes higher risk for high-risk tools and larger diffs", () => {
    const low = computeStepRisk({
      toolName: "edit",
      policyRisk: "medium",
      diffSummary: { additions: 10, deletions: 5 },
    })
    const high = computeStepRisk({
      toolName: "refactorEngine",
      policyRisk: "high",
      diffSummary: { additions: 120, deletions: 90 },
    })

    expect(high).toBeGreaterThan(low)
  })

  it("pauses when cumulative risk reaches threshold", () => {
    expect(shouldAutoPause(10, 10)).toBe(true)
    expect(shouldAutoPause(9.99, 10)).toBe(false)
  })
})
