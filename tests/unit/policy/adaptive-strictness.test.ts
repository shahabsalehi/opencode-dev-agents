import { describe, expect, it } from "vitest"
import { evaluateAdaptiveStrictness } from "../../../src/policy/adaptive.js"

describe("adaptive strictness", () => {
  it("returns relaxed for zero mutation pressure", () => {
    expect(
      evaluateAdaptiveStrictness({
        mutationCount: 0,
        mutationToolRatio: 0,
        largeDiffDetected: false,
        failedVerificationCount: 0,
      })
    ).toBe("relaxed")
  })

  it("returns elevated when mutation volume increases", () => {
    expect(
      evaluateAdaptiveStrictness({
        mutationCount: 8,
        mutationToolRatio: 0.5,
        largeDiffDetected: false,
        failedVerificationCount: 0,
      })
    ).toBe("elevated")
  })

  it("returns elevated for large diff signal", () => {
    expect(
      evaluateAdaptiveStrictness({
        mutationCount: 2,
        mutationToolRatio: 0.2,
        largeDiffDetected: true,
        failedVerificationCount: 0,
      })
    ).toBe("elevated")
  })

  it("returns lockdown for repeated failed verification", () => {
    expect(
      evaluateAdaptiveStrictness({
        mutationCount: 4,
        mutationToolRatio: 0.4,
        largeDiffDetected: false,
        failedVerificationCount: 3,
      })
    ).toBe("lockdown")
  })
})
