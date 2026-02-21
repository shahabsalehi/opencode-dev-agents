import type { SessionRunState } from "./run-ledger.js"

export function formatRunSummary(state: SessionRunState): string {
  return [
    `session=${state.sessionID}`,
    `toolCalls=${state.toolCalls}`,
    `filesModified=${state.filesModified}`,
    `policy.allow=${state.policy.allow}`,
    `policy.deny=${state.policy.deny}`,
    `policy.needsApproval=${state.policy.needsApproval}`,
  ].join(" | ")
}
