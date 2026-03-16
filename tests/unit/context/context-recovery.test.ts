import { describe, expect, it } from "vitest"
import { recoverContextBlocks } from "../../../src/context/recovery.js"

describe("context recovery", () => {
  it("keeps blocks when within budget", () => {
    const result = recoverContextBlocks(["abc", "def"], 10)
    expect(result.blocks).toEqual(["abc", "def"])
    expect(result.truncated).toBe(false)
  })

  it("truncates overflow blocks", () => {
    const result = recoverContextBlocks(["abcdef", "ghij"], 7)
    expect(result.blocks).toEqual(["abcdef", "g"])
    expect(result.truncated).toBe(true)
  })

  it("returns empty blocks when budget is zero", () => {
    const result = recoverContextBlocks(["abc"], 0)
    expect(result.blocks).toEqual([])
    expect(result.truncated).toBe(true)
  })
})
