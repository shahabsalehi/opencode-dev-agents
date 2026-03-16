import { describe, expect, it, vi } from "vitest"
import {
  ApprovalStore,
  formatApprovalRequest,
  formatBlockedMessage,
  formatPendingApprovals,
} from "../../../src/approval-gates.js"

describe("approval store extended", () => {
  it("requires approval for unknown and protected tools", () => {
    const store = new ApprovalStore()
    expect(store.requiresApproval("codeAnalyzer")).toBe(false)
    expect(store.requiresApproval("edit")).toBe(true)
    expect(store.requiresApproval("unknown_tool")).toBe(true)
  })

  it("tracks scoped grants and respects path prefix", () => {
    const store = new ApprovalStore()
    store.requestApproval("s1", "c1", "edit", { filePath: "src/app.ts" })
    const approved = store.approve("s1", "c1", "ok", 60_000)
    expect(approved).toBe(true)

    expect(store.hasScopedGrant("s1", "edit", { filePath: "src/app.ts" })).toBe(true)
    expect(store.hasScopedGrant("s1", "edit", { filePath: "src/other.ts" })).toBe(false)
  })

  it("expires approval state", () => {
    const store = new ApprovalStore()
    store.requestApproval("s2", "c2", "edit", { filePath: "src/a.ts" })
    store.approve("s2", "c2", "ok", 1)

    const nowSpy = vi.spyOn(Date, "now")
    nowSpy.mockReturnValue(Date.now() + 10_000)
    expect(store.isApproved("s2", "c2")).toBe(false)
    nowSpy.mockRestore()
  })

  it("formats request/list/blocked messages", () => {
    const store = new ApprovalStore()
    const request = store.requestApproval("s3", "c3", "bash", { command: "npm test" })

    const requestText = formatApprovalRequest(request)
    const pendingText = formatPendingApprovals([request])
    const blockedText = formatBlockedMessage(request)

    expect(requestText).toContain("Approval Required")
    expect(pendingText).toContain("Pending approvals")
    expect(blockedText).toContain("Action Blocked")
  })
})
