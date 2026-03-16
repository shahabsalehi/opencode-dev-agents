import { describe, expect, it } from "vitest"
import { computePlanHash, shouldRequestSecondOpinion } from "../../../src/opinion/trigger.js"

const config = {
  enabled: true,
  minMutationsBeforeTrigger: 2,
  tier1TimeoutMs: 1000,
  tier2TimeoutMs: 1000,
  tier1Agent: "second-opinion",
  tier2Agent: "code-reviewer",
}

describe("shouldRequestSecondOpinion", () => {
  it("skips when disabled", () => {
    expect(shouldRequestSecondOpinion({
      config: { ...config, enabled: false },
      toolName: "edit",
      risk: "high",
      filesModified: 5,
      planBlocked: false,
      operatorMode: "strict",
    })).toBe(false)
  })

  it("skips for low-risk read tool", () => {
    expect(shouldRequestSecondOpinion({
      config,
      toolName: "read",
      risk: "low",
      filesModified: 5,
      planBlocked: false,
      operatorMode: "strict",
    })).toBe(false)
  })

  it("skips in research mode", () => {
    expect(shouldRequestSecondOpinion({
      config,
      toolName: "edit",
      risk: "high",
      filesModified: 5,
      planBlocked: false,
      operatorMode: "research",
    })).toBe(false)
  })

  it("triggers for high-risk mutation", () => {
    expect(shouldRequestSecondOpinion({
      config,
      toolName: "edit",
      risk: "high",
      filesModified: 3,
      planBlocked: false,
      operatorMode: "strict",
    })).toBe(true)
  })
})

describe("computePlanHash", () => {
  it("is stable for same input and unique for different input", () => {
    const a = computePlanHash("plan:a", "content", "edit")
    const b = computePlanHash("plan:a", "content", "edit")
    const c = computePlanHash("plan:b", "content", "edit")
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a.length).toBe(24)
  })
})
