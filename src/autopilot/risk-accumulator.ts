export type PolicyRisk = "low" | "medium" | "high" | "critical"

const BASE_TOOL_RISK: Record<string, number> = {
  edit: 1,
  write: 1,
  apply_patch: 1,
  bash: 2,
  interactive_bash: 2,
  refactorEngine: 3,
  testGenerator: 2,
}

const POLICY_MULTIPLIER: Record<PolicyRisk, number> = {
  low: 0.5,
  medium: 1,
  high: 2,
  critical: 4,
}

export function computeStepRisk(input: {
  toolName: string
  policyRisk: PolicyRisk
  diffSummary?: {
    additions: number
    deletions: number
  } | null
}): number {
  const base = BASE_TOOL_RISK[input.toolName] ?? 0.5
  const totalDelta = Math.max(0, (input.diffSummary?.additions ?? 0) + (input.diffSummary?.deletions ?? 0))
  const diffMagnitudeMultiplier = Math.min(2, 1 + totalDelta / 200)
  const policyMultiplier = POLICY_MULTIPLIER[input.policyRisk]
  return Number((base * diffMagnitudeMultiplier * policyMultiplier).toFixed(3))
}

export function shouldAutoPause(cumulativeRisk: number, threshold: number): boolean {
  return cumulativeRisk >= threshold
}
