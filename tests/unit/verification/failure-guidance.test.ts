import { describe, expect, it } from "vitest"
import {
  guidanceForApprovalBlock,
  guidanceForBudgetAdvisory,
  guidanceForBudgetBlock,
  guidanceForDelegationPending,
  guidanceForPolicyBlock,
} from "../../../src/execution/failure-guidance.js"

describe("failure guidance", () => {
  it("keeps standard guidance messages to three lines", () => {
    const samples = [
      guidanceForDelegationPending(2),
      guidanceForPolicyBlock("rule-1"),
      guidanceForBudgetBlock("budget-tool-calls-exceeded:26/25"),
      guidanceForBudgetAdvisory("budget-tool-calls-exceeded:26/25"),
      guidanceForApprovalBlock("edit", "call-1"),
    ]

    for (const sample of samples) {
      const lines = sample.split("\n")
      expect(lines.length).toBe(3)
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(140)
      }
    }
  })
})
