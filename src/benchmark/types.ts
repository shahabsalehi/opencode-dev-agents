export type ScoreDimension =
  | "governance"
  | "apiAlignment"
  | "architecture"
  | "testMaturity"
  | "sdkCorrectness"
  | "toolBreadth"
  | "reliability"
  | "dxQuality"

export type GovernanceScorecard = {
  timestamp: string
  projectID: string
  version: string
  summary: string
  scores: Record<ScoreDimension, number>
}

export type ScorecardDiff = {
  dimension: ScoreDimension
  previous: number
  current: number
  delta: number
}
