import { readFile } from "fs/promises"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"
import { describe, expect, it } from "vitest"
import { bugDetector } from "../../../src/tools/bug-detector.js"

type ToolResult = {
  summary: {
    overallVerdict?: string
    highConfidenceRatio?: number
    mode?: string
    confidenceBreakdown?: {
      high: number
      medium: number
      low: number
      heuristic: number
    }
  }
}

const currentFile = fileURLToPath(import.meta.url)
const repoDir = resolve(dirname(currentFile), "../../..")

function parseResult(output: string): ToolResult {
  return JSON.parse(output) as ToolResult
}

const toolContext = {
  directory: repoDir,
  metadata: () => undefined
}

describe("bugDetector confidence scoring", () => {
  it("marks AST-backed security findings as trusted in precise mode", async () => {
    const fixture = await readFile(resolve(repoDir, "tests/fixtures/bug-trusted.js"), "utf-8")
    expect(fixture.length).toBeGreaterThan(0)

    const output = await bugDetector.execute(
      {
        scope: "tests/fixtures/bug-trusted.js",
        mode: "precise",
        patterns: ["security"],
        severity: "all",
        maxResults: 50,
        includeSuggestions: true,
        diffOnly: false
      },
      toolContext as never
    )

    const parsed = parseResult(output)
    expect(parsed.summary.mode).toBe("precise")
    expect(parsed.summary.overallVerdict).toBe("trusted")
    expect(parsed.summary.highConfidenceRatio).toBeGreaterThanOrEqual(0.7)
  })

  it("marks heuristic-heavy findings as needs-review in precise mode", async () => {
    const output = await bugDetector.execute(
      {
        scope: "tests/fixtures/bug-untrusted.js",
        mode: "precise",
        patterns: ["security"],
        severity: "all",
        maxResults: 50,
        includeSuggestions: true,
        diffOnly: false
      },
      toolContext as never
    )

    const parsed = parseResult(output)
    expect(parsed.summary.mode).toBe("precise")
    expect(parsed.summary.overallVerdict).toBe("needs-review")
    expect(parsed.summary.highConfidenceRatio).toBeLessThan(0.7)
    expect(parsed.summary.confidenceBreakdown?.low).toBeGreaterThan(0)
  })
})
