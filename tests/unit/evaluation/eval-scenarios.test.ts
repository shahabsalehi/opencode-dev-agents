import { describe, expect, it } from "vitest"
import { GOVERNANCE_EVAL_SCENARIOS } from "../../../src/benchmark/eval-scenarios.js"

describe("GOVERNANCE_EVAL_SCENARIOS", () => {
  it("has minimum set of scenarios", () => {
    expect(GOVERNANCE_EVAL_SCENARIOS.length).toBeGreaterThanOrEqual(8)
  })

  it("defines required fields", () => {
    for (const scenario of GOVERNANCE_EVAL_SCENARIOS) {
      expect(scenario.id.length).toBeGreaterThan(0)
      expect(scenario.description.length).toBeGreaterThan(0)
      expect(scenario.input.toolName.length).toBeGreaterThan(0)
    }
  })
})
