import { describe, expect, it } from "vitest"
import { opinionCache } from "../../../src/opinion/opinion-cache.js"

describe("opinion cache", () => {
  it("stores and retrieves values", () => {
    opinionCache.set("k1", {
      value: {
        verdict: "proceed",
        risks: [],
        suggestion: null,
        confidence: 1,
        reviewerTier: "lightweight",
      },
    })

    const cached = opinionCache.get("k1")?.value
    expect(cached?.verdict).toBe("proceed")
  })
})
