import { describe, expect, it } from "vitest"
import { buildContinuationHandoff } from "../../../src/continuation/handoff.js"

describe("buildContinuationHandoff", () => {
  it("builds concise continuation summary", () => {
    const output = buildContinuationHandoff({
      runState: {
        sessionID: "s1",
        startedAt: Date.now(),
        lastUpdatedAt: Date.now(),
        toolCalls: 5,
        filesModified: 2,
        policy: {
          allow: 3,
          deny: 1,
          needsApproval: 1,
          byRisk: { low: 1, medium: 2, high: 1, critical: 1 },
        },
      },
      pendingApprovals: 1,
      pendingDelegations: 2,
      latestPlanTitle: "plan: fix bug",
      latestPlanAgeMinutes: 4,
    })

    expect(output).toContain("Continuation Handoff")
    expect(output).toContain("plan: fix bug")
  })
})
