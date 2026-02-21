import { describe, expect, it } from "vitest"
import { normalizeToolOutput } from "../../../src/normalization/tool-output.js"

describe("normalizeToolOutput", () => {
  it("marks blocked outputs correctly", () => {
    const normalized = normalizeToolOutput("edit", "blocked", { policyBlocked: true })
    expect(normalized.status).toBe("blocked")
  })

  it("marks warning output when warning text exists", () => {
    const normalized = normalizeToolOutput("read", "warning: check input", {})
    expect(normalized.status).toBe("warning")
  })
})
