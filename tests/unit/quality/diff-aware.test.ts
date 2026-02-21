import { describe, expect, it } from "vitest"
import { hasDiffPressure, rankDiffChanges, selectTopChangedFiles } from "../../../src/utils/diff-aware.js"

describe("diff aware utilities", () => {
  it("ranks changes by total churn", () => {
    const ranked = rankDiffChanges([
      { file: "b.ts", additions: 1, deletions: 1 },
      { file: "a.ts", additions: 4, deletions: 0 },
      { file: "c.ts", additions: 2, deletions: 3 },
    ])

    expect(ranked.map((item) => item.file)).toEqual(["c.ts", "a.ts", "b.ts"])
  })

  it("selects top changed files with limits", () => {
    const files = selectTopChangedFiles(
      [
        { file: "x.ts", additions: 5, deletions: 0 },
        { file: "y.ts", additions: 1, deletions: 1 },
      ],
      1
    )

    expect(files).toEqual(["x.ts"])
  })

  it("detects diff pressure", () => {
    expect(hasDiffPressure([{ file: "x.ts", additions: 2, deletions: 1 }], 4)).toBe(false)
    expect(hasDiffPressure([{ file: "x.ts", additions: 2, deletions: 1 }], 3)).toBe(true)
  })
})
