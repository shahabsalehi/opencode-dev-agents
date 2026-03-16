import { describe, expect, it } from "vitest"
import { runEvalScenarios } from "../../../src/benchmark/eval-harness.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../../src/policy/defaults.js"

describe("runEvalScenarios", () => {
  it("passes matching scenario", () => {
    const summary = runEvalScenarios([
      {
        id: "s1",
        description: "read",
        input: { toolName: "read", args: {} },
        expectedDecision: "allow",
        expectedMinRisk: "low",
      },
    ], { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: false })
    expect(summary.passRate).toBe(1)
  })

  it("fails mismatched scenario", () => {
    const summary = runEvalScenarios([
      {
        id: "s1",
        description: "read",
        input: { toolName: "read", args: {} },
        expectedDecision: "deny",
        expectedMinRisk: "critical",
      },
    ], { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: false })
    expect(summary.passRate).toBe(0)
  })
})
