import { describe, expect, it } from "vitest"
import { budgetContextBlocks, rankContextBlocks } from "../../../src/context/ranker.js"

describe("context ranker", () => {
  it("prioritizes core context over domain", () => {
    const blocks = [
      "## Context (domain)\nfoo",
      "## Context (core)\nbar",
    ]

    const ranked = rankContextBlocks(blocks)
    expect(ranked[0]).toContain("(core)")
  })

  it("respects budget cap", () => {
    const blocks = ["a", "b", "c", "d"]
    const budgeted = budgetContextBlocks(blocks, 2)
    expect(budgeted).toHaveLength(2)
    expect(budgeted).toEqual(["a", "b"])
  })
})
