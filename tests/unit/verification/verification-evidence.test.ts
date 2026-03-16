import { describe, expect, it } from "vitest"
import { evaluateVerificationContract } from "../../../src/verify/contract.js"

describe("verification evidence", () => {
  it("passes mutation contract when complete evidence is provided", () => {
    const result = evaluateVerificationContract(
      "edit",
      {
        verificationEvidence: {
          typecheck: true,
          tests: true,
          build: true,
        },
      },
      "ok"
    )

    expect(result.verdict).toBe("pass")
    expect(result.reason).toBe("mutation-verification-evidence-complete")
  })

  it("requires review when evidence is missing", () => {
    const result = evaluateVerificationContract("write", {}, "ok")
    expect(result.verdict).toBe("needs-review")
    expect(result.reason).toBe("mutation-evidence-required:typecheck+tests+build")
  })
})
