import { describe, expect, it } from "vitest"
import { buildGovernanceReport } from "../../../src/audit/report.js"

describe("governance report", () => {
  it("builds aggregated report fields", () => {
    const report = buildGovernanceReport({
      sessionID: "s1",
      runState: {
        sessionID: "s1",
        startedAt: 1,
        lastUpdatedAt: 2,
        toolCalls: 8,
        filesModified: 3,
        policy: {
          allow: 4,
          deny: 1,
          needsApproval: 3,
          byRisk: { low: 2, medium: 2, high: 3, critical: 1 },
        },
      },
      pendingApprovals: 2,
      delegationStatuses: [{ status: "pending" }, { status: "running" }, { status: "completed" }],
      thoughtCount: 5,
    })

    expect(report.sessionID).toBe("s1")
    expect(report.toolCalls).toBe(8)
    expect(report.pendingApprovals).toBe(2)
    expect(report.delegations.total).toBe(3)
    expect(report.delegations.pending).toBe(1)
    expect(report.delegations.running).toBe(1)
    expect(report.thoughts).toBe(5)
  })
})
