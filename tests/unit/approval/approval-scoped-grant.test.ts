import { describe, expect, it } from "vitest"
import { ApprovalStore } from "../../../src/approval-gates.js"

describe("approval scoped grants", () => {
  it("creates scoped grant on approve and matches same path", () => {
    const store = new ApprovalStore()
    const req = store.requestApproval("s1", "c1", "edit", { filePath: "src/a.ts" })
    expect(req.status).toBe("pending")

    const approved = store.approve("s1", "c1", "ok", 60_000)
    expect(approved).toBe(true)
    expect(store.hasScopedGrant("s1", "edit", { filePath: "src/a.ts" })).toBe(true)
    expect(store.hasScopedGrant("s1", "edit", { filePath: "docs/readme.md" })).toBe(false)
  })
})
