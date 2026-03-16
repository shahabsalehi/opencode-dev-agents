import type { SessionRunState } from "../audit/run-ledger.js"

export function buildContinuationHandoff(input: {
  runState: SessionRunState
  pendingApprovals: number
  pendingDelegations: number
  latestPlanTitle?: string
  latestPlanAgeMinutes?: number
}): string {
  const lines = [
    "## Continuation Handoff",
    `Session: ${input.runState.sessionID}`,
    `Tool calls: ${input.runState.toolCalls}`,
    `Files modified: ${input.runState.filesModified}`,
    `Policy (allow/deny/approval): ${input.runState.policy.allow}/${input.runState.policy.deny}/${input.runState.policy.needsApproval}`,
    `Pending approvals: ${input.pendingApprovals}`,
    `Pending delegations: ${input.pendingDelegations}`,
  ]

  if (input.latestPlanTitle) {
    const age = input.latestPlanAgeMinutes ?? 0
    lines.push(`Latest plan: ${input.latestPlanTitle} (${age}m old)`)
  } else {
    lines.push("Latest plan: not found")
  }

  lines.push("Next action: resolve pending blockers first, then continue from latest plan steps.")
  return lines.join("\n")
}
