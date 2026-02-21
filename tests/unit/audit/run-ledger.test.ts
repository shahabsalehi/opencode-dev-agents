import { describe, expect, it } from "vitest"
import { RunLedger } from "../../../src/audit/run-ledger.js"
import { formatRunSummary } from "../../../src/audit/summary.js"

describe("run ledger", () => {
  it("tracks tool calls, mutations, and policy decisions", () => {
    const ledger = new RunLedger()
    const sessionID = "sess-1"

    ledger.recordToolCall(sessionID)
    ledger.recordToolCall(sessionID)
    ledger.recordMutation(sessionID)
    ledger.recordPolicyDecision(sessionID, "allow", "low")
    ledger.recordPolicyDecision(sessionID, "deny", "critical")
    ledger.recordPolicyDecision(sessionID, "needs-approval", "high")

    const state = ledger.get(sessionID)
    expect(state.toolCalls).toBe(2)
    expect(state.filesModified).toBe(1)
    expect(state.policy.allow).toBe(1)
    expect(state.policy.deny).toBe(1)
    expect(state.policy.needsApproval).toBe(1)
    expect(state.policy.byRisk.low).toBe(1)
    expect(state.policy.byRisk.high).toBe(1)
    expect(state.policy.byRisk.critical).toBe(1)
  })

  it("formats concise run summary", () => {
    const ledger = new RunLedger()
    const sessionID = "sess-2"
    ledger.recordToolCall(sessionID)
    ledger.recordPolicyDecision(sessionID, "allow", "medium")

    const summary = formatRunSummary(ledger.get(sessionID))
    expect(summary).toContain("session=sess-2")
    expect(summary).toContain("toolCalls=1")
    expect(summary).toContain("policy.allow=1")
  })
})
