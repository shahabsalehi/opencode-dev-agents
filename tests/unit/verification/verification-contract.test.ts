import { describe, expect, it } from "vitest"
import { evaluateVerificationContract } from "../../../src/verify/contract.js"

describe("verification contract", () => {
  it("passes for valid analysis output schema", () => {
    const output = JSON.stringify({
      summary: { mode: "precise" },
      details: "ok",
      metadata: { tool: "codeAnalyzer" },
    })

    const result = evaluateVerificationContract("codeAnalyzer", undefined, output)
    expect(result.verdict).toBe("pass")
  })

  it("needs review for mutation tool by default", () => {
    const result = evaluateVerificationContract("write", {}, "done")
    expect(result.verdict).toBe("needs-review")
  })

  it("passes trusted review output", () => {
    const output = JSON.stringify({
      summary: { overallVerdict: "trusted" },
      details: "ok",
      metadata: { tool: "reviewTool" },
    })
    const result = evaluateVerificationContract("reviewTool", undefined, output)
    expect(result.verdict).toBe("pass")
  })
})
