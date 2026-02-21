import type { SessionRunState } from "./run-ledger.js"

export type GovernanceReport = {
  sessionID: string
  toolCalls: number
  filesModified: number
  pendingApprovals: number
  delegations: {
    total: number
    pending: number
    running: number
  }
  thoughts: number
  policy: SessionRunState["policy"]
  updatedAt: number
}

export function buildGovernanceReport(input: {
  sessionID: string
  runState: SessionRunState
  pendingApprovals: number
  delegationStatuses: Array<{ status: string }>
  thoughtCount: number
}): GovernanceReport {
  const pending = input.delegationStatuses.filter((item) => item.status === "pending").length
  const running = input.delegationStatuses.filter((item) => item.status === "running").length

  return {
    sessionID: input.sessionID,
    toolCalls: input.runState.toolCalls,
    filesModified: input.runState.filesModified,
    pendingApprovals: input.pendingApprovals,
    delegations: {
      total: input.delegationStatuses.length,
      pending,
      running,
    },
    thoughts: input.thoughtCount,
    policy: input.runState.policy,
    updatedAt: input.runState.lastUpdatedAt,
  }
}
