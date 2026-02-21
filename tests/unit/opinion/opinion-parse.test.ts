import { describe, expect, it } from "vitest"
import { opinionFailSafeForTier, parseOpinionResponse } from "../../../src/opinion/parse-response.js"

describe("parseOpinionResponse", () => {
  it("parses valid JSON", () => {
    const parsed = parseOpinionResponse(
      JSON.stringify({ verdict: "caution", risks: ["a"], suggestion: "b", confidence: 0.8 }),
      "lightweight"
    )
    expect(parsed.verdict).toBe("caution")
    expect(parsed.risks).toEqual(["a"])
    expect(parsed.reviewerTier).toBe("lightweight")
  })

  it("falls back on invalid JSON", () => {
    const parsed = parseOpinionResponse("not-json", "lightweight")
    expect(parsed.verdict).toBe("proceed")
  })

  it("clamps confidence", () => {
    const parsed = parseOpinionResponse(
      JSON.stringify({ verdict: "proceed", risks: [], suggestion: null, confidence: 99 }),
      "lightweight"
    )
    expect(parsed.confidence).toBe(1)
  })
})

describe("opinionFailSafeForTier", () => {
  it("returns caution for strong tier", () => {
    expect(opinionFailSafeForTier("strong").verdict).toBe("caution")
  })
})
