import { describe, expect, it } from "vitest"
import { ApprovalStore } from "../../../src/approval-gates.js"

describe("approval risk metadata", () => {
  it("stores risk and policy reason on approval request", () => {
    const store = new ApprovalStore()
    const request = store.requestApproval(
      "session-1",
      "call-1",
      "edit",
      { filePath: "src/index.ts" },
      {
        riskLevel: "high",
        policyReason: "high-risk-tool",
      }
    )

    expect(request.riskLevel).toBe("high")
    expect(request.policyReason).toBe("high-risk-tool")
  })
})
