import { describe, expect, it } from "vitest"
import { DEFAULT_REDLINE_RULES, findMatchedRedline } from "../../../src/policy/redlines.js"

describe("policy redlines", () => {
  it("matches git push as redline", () => {
    const rule = findMatchedRedline("git push origin main", DEFAULT_REDLINE_RULES)
    expect(rule?.id).toBe("git-push")
  })

  it("matches destructive rm -rf as redline", () => {
    const rule = findMatchedRedline("rm -rf ./tmp", DEFAULT_REDLINE_RULES)
    expect(rule?.id).toBe("rm-rf")
  })

  it("does not flag benign bash command", () => {
    const rule = findMatchedRedline("npm run test", DEFAULT_REDLINE_RULES)
    expect(rule).toBeNull()
  })

  it("matches git clean variant order as redline", () => {
    const rule = findMatchedRedline("git clean -xdf", DEFAULT_REDLINE_RULES)
    expect(rule?.id).toBe("git-clean-fdx")
  })
})
