import type { GovernanceScorecard, ScorecardDiff, ScoreDimension } from "./types.js"

const DIMENSIONS: ScoreDimension[] = [
  "governance",
  "apiAlignment",
  "architecture",
  "testMaturity",
  "sdkCorrectness",
  "toolBreadth",
  "reliability",
  "dxQuality",
]

export function diffScorecards(previous: GovernanceScorecard, current: GovernanceScorecard): ScorecardDiff[] {
  return DIMENSIONS.map((dimension) => {
    const prior = previous.scores[dimension]
    const next = current.scores[dimension]
    return {
      dimension,
      previous: prior,
      current: next,
      delta: Math.round((next - prior) * 10) / 10,
    }
  })
}
