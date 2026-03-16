import { describe, expect, it } from "vitest"
import { evaluateDiffQuality } from "../../../src/quality/diff-checks.js"

describe("evaluateDiffQuality", () => {
  it("returns warnings for broad risky mutations", () => {
    const warnings = evaluateDiffQuality({
      toolName: "edit",
      diff: { files: 12, additions: 260, deletions: 120 },
      verificationEvidence: {},
    })
    expect(warnings.length).toBeGreaterThan(0)
  })

  it("returns no warnings for narrow evidenced mutation", () => {
    const warnings = evaluateDiffQuality({
      toolName: "edit",
      diff: { files: 1, additions: 12, deletions: 2 },
      verificationEvidence: { tests: true },
    })
    expect(warnings).toEqual([])
  })
})
