import type { RunLedger } from "../audit/run-ledger.js"
import { evaluatePolicy } from "./evaluate.js"
import type { PolicyEvaluation, PolicyInput, StrictControlPolicy } from "./types.js"

export type PolicyBeforeResult = {
  blocked: boolean
  message?: string
  evaluation: PolicyEvaluation
}

export function shouldRequireApproval(evaluation: PolicyEvaluation): boolean {
  if (evaluation.decision === "needs-approval") return true
  return evaluation.risk === "high" || evaluation.risk === "critical"
}

function formatBlockedMessage(evaluation: PolicyEvaluation): string {
  const details = evaluation.matchedRuleID
    ? ` rule=${evaluation.matchedRuleID}`
    : ""
  return `❌ Policy Blocked (${evaluation.risk}): ${evaluation.reason}${details}`
}

export function enforcePolicyBefore(
  input: PolicyInput,
  policy: StrictControlPolicy,
  ledger: RunLedger,
  sessionID?: string
): PolicyBeforeResult {
  const evaluation = evaluatePolicy(input, policy, sessionID)
  if (sessionID) {
    ledger.recordPolicyDecision(sessionID, evaluation.decision, evaluation.risk)
  }

  if (evaluation.decision === "deny") {
    return {
      blocked: true,
      message: formatBlockedMessage(evaluation),
      evaluation,
    }
  }

  return {
    blocked: false,
    evaluation,
  }
}
