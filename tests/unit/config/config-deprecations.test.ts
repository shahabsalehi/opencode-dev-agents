import { describe, expect, it } from "vitest"
import { checkDeprecations } from "../../../src/config-deprecations.js"

describe("checkDeprecations", () => {
  it("returns no warnings for clean config", () => {
    expect(checkDeprecations({ mode: "strict" })).toEqual([])
  })

  it("warns on deprecated top-level mcp fields", () => {
    const warnings = checkDeprecations({
      mcpEnabled: true,
      mcpAllowlist: [],
      mcpDenylist: [],
    })
    expect(warnings).toHaveLength(3)
  })
})
