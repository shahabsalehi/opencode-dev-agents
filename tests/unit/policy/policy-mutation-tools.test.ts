import { describe, expect, it } from "vitest"
import { shouldTrackMutation } from "../../../src/policy/mutation-tools.js"

describe("policy mutation tools", () => {
  it("tracks apply_patch as mutation", () => {
    expect(shouldTrackMutation("apply_patch", {})).toBe(true)
  })

  it("tracks refactorEngine only when dryRun is false", () => {
    expect(shouldTrackMutation("refactorEngine", { dryRun: false })).toBe(true)
    expect(shouldTrackMutation("refactorEngine", { dryRun: true })).toBe(false)
  })

  it("does not track read-only tools", () => {
    expect(shouldTrackMutation("read", { filePath: "src/index.ts" })).toBe(false)
  })
})
