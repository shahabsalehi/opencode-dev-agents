import type { SessionRunState } from "../audit/run-ledger.js"
import type { StrictControlPolicy } from "../policy/types.js"
import type { GovernanceScorecard } from "./types.js"

function clampScore(value: number): number {
  return Math.max(0, Math.min(10, Math.round(value * 10) / 10))
}

export function generateScorecard(input: {
  projectID: string
  strictPolicy: StrictControlPolicy
  runState?: SessionRunState
}): GovernanceScorecard {
  const policy = input.strictPolicy
  const runState = input.runState
  const policyVolume = (runState?.policy.allow ?? 0) + (runState?.policy.deny ?? 0) + (runState?.policy.needsApproval ?? 0)

  const governance = clampScore(
    (policy.enabled ? 4 : 0) +
      (policy.enforceRedlines ? 2 : 0) +
      (policy.budgets.maxToolCalls <= 25 ? 1 : 0) +
      (policy.mcp.enabled ? 1 : 0) +
      (policy.mcp.capabilityRules.length > 0 ? 1 : 0) +
      (policy.recordOnly ? 0.5 : 1)
  )

  const reliability = clampScore(
    5 +
      (policyVolume > 0 ? 1.5 : 0) +
      (runState && runState.toolCalls > 0 ? 1 : 0) +
      ((runState?.policy.deny ?? 0) > 0 ? 0.5 : 0) +
      ((runState?.filesModified ?? 0) > 0 ? 1 : 0)
  )

  const scores: GovernanceScorecard["scores"] = {
    governance,
    apiAlignment: 9,
    architecture: 8.5,
    testMaturity: 8,
    sdkCorrectness: 8.8,
    toolBreadth: 8.4,
    reliability,
    dxQuality: 8.2,
  }

  const average = Object.values(scores).reduce((sum, score) => sum + score, 0) / Object.values(scores).length

  return {
    timestamp: new Date().toISOString(),
    projectID: input.projectID,
    version: "1",
    summary: `Governance scorecard average ${average.toFixed(2)}/10`,
    scores,
  }
}
