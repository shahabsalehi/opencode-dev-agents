import { describe, expect, it } from "vitest"
import { validateCompactionOutput } from "../../../src/context/compaction-validator.js"

describe("validateCompactionOutput", () => {
  it("accepts valid compaction output", () => {
    const result = validateCompactionOutput(["meaningful context block content goes here"])
    expect(result.valid).toBe(true)
  })

  it("rejects empty output", () => {
    const result = validateCompactionOutput([])
    expect(result.valid).toBe(false)
    expect(result.reason).toBe("compaction-output-empty")
  })

  it("rejects trivial output", () => {
    const result = validateCompactionOutput(["x"])
    expect(result.valid).toBe(false)
    expect(result.reason).toBe("compaction-output-trivial")
  })
})
