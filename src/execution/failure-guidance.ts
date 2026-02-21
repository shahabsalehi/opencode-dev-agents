import { buildPlanScaffold } from "../plan/scaffold.js"

export function guidanceForPlanFirst(toolName: string, detail: string): string {
  return `${[
    `Plan required before ${toolName}.`,
    detail,
    "Next: log a 'plan:' thought, then rerun the tool.",
  ].join("\n")}\n\nSuggested plan template:\n${buildPlanScaffold(toolName)}`
}

export function guidanceForDelegationPending(pendingCount: number): string {
  return [
    `${pendingCount} delegation(s) still running.`,
    "Wait for completion messages before mutating files.",
    "Fallback: check delegation_status, then delegation_read.",
  ].join("\n")
}

export function guidanceForPolicyBlock(reason: string): string {
  return [
    `Policy blocked action: ${reason}.`,
    "Use narrower scope or an allowlisted safer tool.",
    "Fallback: request approval with risk and verification evidence.",
  ].join("\n")
}

export function guidanceForBudgetBlock(reason: string): string {
  return [
    `Budget threshold reached: ${reason}.`,
    "Split edits into smaller batches to continue safely.",
    "Fallback: request scoped approval for this call.",
  ].join("\n")
}

export function guidanceForBudgetAdvisory(reason: string): string {
  return [
    `Budget advisory: ${reason}.`,
    "Continue cautiously and keep mutation scope focused.",
    "Fallback: switch to strict profile for hard budget enforcement.",
  ].join("\n")
}

export function guidanceForApprovalBlock(toolName: string, callID: string): string {
  return [
    `Approval required for ${toolName} (${callID}).`,
    `Approve: approval { action: 'approve', callID: '${callID}' }`,
    "Fallback: deny and choose a lower-risk alternative.",
  ].join("\n")
}
