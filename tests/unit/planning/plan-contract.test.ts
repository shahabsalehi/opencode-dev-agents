import { describe, expect, it } from "vitest"
import { evaluatePlanEvidence, requiresPlan } from "../../../src/plan/plan-contract.js"

describe("requiresPlan", () => {
  it("flags mutation tools", () => {
    expect(requiresPlan("edit")).toBe(true)
    expect(requiresPlan("write")).toBe(true)
    expect(requiresPlan("bash")).toBe(true)
  })

  it("ignores read-only tools", () => {
    expect(requiresPlan("read")).toBe(false)
    expect(requiresPlan("glob")).toBe(false)
  })
})

describe("evaluatePlanEvidence", () => {
  it("returns true for fresh plan", () => {
    const now = Date.now()
    const result = evaluatePlanEvidence([
      { id: "1", title: "plan: do migration", content: "steps", createdAt: now - 1000 },
    ], { enabled: true, maxPlanAgeMs: 10_000 })
    expect(result.hasPlan).toBe(true)
  })

  it("returns false for stale plan", () => {
    const now = Date.now()
    const result = evaluatePlanEvidence([
      { id: "1", title: "plan: old", content: "steps", createdAt: now - 100_000 },
    ], { enabled: true, maxPlanAgeMs: 10_000 })
    expect(result.hasPlan).toBe(false)
  })

  it("returns false when no plan exists", () => {
    const result = evaluatePlanEvidence([
      { id: "1", title: "note: random", content: "x", createdAt: Date.now() },
    ], { enabled: true, maxPlanAgeMs: 10_000 })
    expect(result.hasPlan).toBe(false)
  })
})
