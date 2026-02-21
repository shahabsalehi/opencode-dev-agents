import { describe, expect, it } from "vitest"
import { compressContextBlocks } from "../../../src/context/compression.js"

describe("context compression edge", () => {
  it("returns original blocks when under budget", () => {
    const result = compressContextBlocks(["## A\nline1\nline2"], 10)
    expect(result.blocks).toEqual(["## A\nline1\nline2"])
    expect(result.stats.trimmedLines).toBe(0)
  })

  it("trims sections and preserves headers when over budget", () => {
    const input = [
      "## Alpha\na1\na2\na3\n## Beta\nb1\nb2",
      "plain1\nplain2",
    ]
    const result = compressContextBlocks(input, 4)
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]).toContain("## Alpha")
    expect(result.stats.trimmedLines).toBeGreaterThan(0)
  })
})
