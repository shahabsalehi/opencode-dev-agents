import { describe, expect, it } from "vitest"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../../src/policy/defaults.js"
import { generateScorecard } from "../../../src/benchmark/scorecard-generator.js"

describe("scorecard generator", () => {
  it("generates bounded scores and summary", () => {
    const card = generateScorecard({
      projectID: "proj-a",
      strictPolicy: {
        ...DEFAULT_STRICT_CONTROL_POLICY,
        recordOnly: false,
        mcp: {
          ...DEFAULT_STRICT_CONTROL_POLICY.mcp,
          capabilityRules: [
            {
              serverPrefix: "mcp.github",
              maxCallsPerSession: 5,
              capabilities: ["read", "write", "execute", "network"],
            },
          ],
        },
      },
    })

    expect(card.projectID).toBe("proj-a")
    expect(card.summary).toContain("average")
    for (const value of Object.values(card.scores)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(10)
    }
  })
})
