import { describe, expect, it } from "vitest"
import { DEFAULTS } from "../../../src/config.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../../src/policy/defaults.js"

describe("policy defaults", () => {
  it("keeps refactorEngine dryRun default true", () => {
    expect(DEFAULTS.tools.refactorEngine.dryRun).toBe(true)
  })

  it("enables strict control mode by default", () => {
    expect(DEFAULTS.strictControl.enabled).toBe(true)
    expect(DEFAULTS.strictControl.enforceRedlines).toBe(true)
    expect(DEFAULTS.strictControl.recordOnly).toBe(true)
  })

  it("uses conservative strict policy budgets", () => {
    expect(DEFAULT_STRICT_CONTROL_POLICY.budgets.maxChangedFiles).toBe(5)
    expect(DEFAULT_STRICT_CONTROL_POLICY.budgets.maxTotalLocDelta).toBe(400)
    expect(DEFAULT_STRICT_CONTROL_POLICY.budgets.maxNewFiles).toBe(5)
    expect(DEFAULT_STRICT_CONTROL_POLICY.budgets.maxToolCalls).toBe(25)
  })
})
