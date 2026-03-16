import { dirname, resolve } from "path"
import { fileURLToPath } from "url"
import { describe, expect, it } from "vitest"
import { reviewTool } from "../../../src/tools/review-tool.js"

type ReviewSummary = {
  overallVerdict?: string
  highConfidenceRatio?: number
  mode?: string
}

function parseSummary(output: string): ReviewSummary {
  const parsed = JSON.parse(output) as { summary: ReviewSummary }
  return parsed.summary
}

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const toolContext = {
  directory: repoDir,
  metadata: () => undefined
}

describe("reviewTool threshold gating", () => {
  it("returns trusted when ratio is at/above 0.70", { timeout: 20000 }, async () => {
    const output = await reviewTool.execute(
      {
        scope: "tests/fixtures/bug-trusted.js",
        focus: "all",
        mode: "precise",
        minHighConfidenceRatio: 0.7,
        diffOnly: false
      },
      toolContext as never
    )

    const summary = parseSummary(output)
    expect(summary.mode).toBe("precise")
    expect(summary.overallVerdict).toBe("trusted")
    expect(summary.highConfidenceRatio).toBeGreaterThanOrEqual(0.7)
  })

  it("returns needs-review when ratio is below 0.70", async () => {
    const output = await reviewTool.execute(
      {
        scope: "tests/fixtures/review-needs-review.py",
        focus: "all",
        mode: "precise",
        minHighConfidenceRatio: 0.7,
        diffOnly: false
      },
      toolContext as never
    )

    const summary = parseSummary(output)
    expect(summary.mode).toBe("precise")
    expect(summary.overallVerdict).toBe("needs-review")
    expect(summary.highConfidenceRatio).toBeLessThan(0.7)
  })
})
