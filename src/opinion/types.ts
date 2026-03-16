export type OpinionVerdict = "proceed" | "caution" | "escalate"

export type OpinionTier = "lightweight" | "strong"

export type SecondOpinionRequest = {
  planTitle: string
  planContent: string
  toolName: string
  toolArgs?: Record<string, unknown>
  sessionID: string
  mutationCount: number
  policyRisk: "low" | "medium" | "high" | "critical"
}

export type SecondOpinionResponse = {
  verdict: OpinionVerdict
  risks: string[]
  suggestion: string | null
  confidence: number
  reviewerTier: OpinionTier
}

export type SecondOpinionConfig = {
  enabled: boolean
  minMutationsBeforeTrigger: number
  tier1TimeoutMs: number
  tier2TimeoutMs: number
  tier1Agent: string
  tier2Agent: string
  escalateConfidenceThreshold: number
  maxEscalationsPerSession: number
}
