import type { SessionRunState } from "../audit/run-ledger.js"
import type { MutationBudgets } from "./types.js"
import { shouldTrackMutation } from "./mutation-tools.js"

export type BudgetEvaluation = {
  exceeded: boolean
  reason?: string
}

export function shouldBlockForBudget(params: {
  exceeded: boolean
  approved: boolean
  scopedGranted: boolean
}): boolean {
  if (!params.exceeded) return false
  if (params.approved || params.scopedGranted) return false
  return true
}

export function evaluateBudgetGate(
  state: SessionRunState,
  toolName: string,
  args: Record<string, unknown> | undefined,
  budgets: MutationBudgets
): BudgetEvaluation {
  if (state.toolCalls > budgets.maxToolCalls) {
    return {
      exceeded: true,
      reason: `budget-tool-calls-exceeded:${state.toolCalls}/${budgets.maxToolCalls}`,
    }
  }

  if (shouldTrackMutation(toolName, args) && state.filesModified >= budgets.maxChangedFiles) {
    return {
      exceeded: true,
      reason: `budget-files-modified-exceeded:${state.filesModified}/${budgets.maxChangedFiles}`,
    }
  }

  return { exceeded: false }
}
