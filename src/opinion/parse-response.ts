import type { OpinionTier, SecondOpinionResponse } from "./types.js"

function fallback(tier: OpinionTier, verdict: "proceed" | "caution" = "proceed"): SecondOpinionResponse {
  return {
    verdict,
    risks: [],
    suggestion: null,
    confidence: 0,
    reviewerTier: tier,
  }
}

export function parseOpinionResponse(raw: string, tier: OpinionTier): SecondOpinionResponse {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const verdict = parsed.verdict
    const risks = parsed.risks
    if (
      (verdict !== "proceed" && verdict !== "caution" && verdict !== "escalate") ||
      !Array.isArray(risks)
    ) {
      return fallback(tier)
    }

    const suggestion = typeof parsed.suggestion === "string"
      ? parsed.suggestion.slice(0, 200)
      : null

    const confidenceRaw = parsed.confidence
    const confidence = typeof confidenceRaw === "number"
      ? Math.max(0, Math.min(1, confidenceRaw))
      : 0.5

    return {
      verdict,
      risks: risks.slice(0, 3).map((item) => String(item).slice(0, 120)),
      suggestion,
      confidence,
      reviewerTier: tier,
    }
  } catch {
    return fallback(tier)
  }
}

export function opinionFailSafeForTier(tier: OpinionTier): SecondOpinionResponse {
  return fallback(tier, tier === "strong" ? "caution" : "proceed")
}
