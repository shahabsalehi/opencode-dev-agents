import { describe, expect, it } from "vitest"
import { CompactionRescueCache } from "../../../src/context/compaction-rescue.js"

describe("CompactionRescueCache", () => {
  it("captures and rescues snapshots", () => {
    const cache = new CompactionRescueCache({ cooldownMs: 0 })
    cache.captureSnapshot("s1", ["a", "b"])
    expect(cache.rescue("s1", [])).toEqual(["a", "b"])
  })

  it("returns null without snapshot", () => {
    const cache = new CompactionRescueCache({ cooldownMs: 0 })
    expect(cache.rescue("none", [])).toBeNull()
  })

  it("enforces cooldown", async () => {
    const cache = new CompactionRescueCache({ cooldownMs: 100 })
    cache.captureSnapshot("s1", ["a"])
    expect(cache.rescue("s1", [])).toEqual(["a"])
    expect(cache.rescue("s1", [])).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(cache.rescue("s1", [])).toEqual(["a"])
  })

  it("evicts oldest when full", () => {
    const cache = new CompactionRescueCache({ cooldownMs: 0, maxCacheSize: 2 })
    cache.captureSnapshot("s1", ["a"])
    cache.captureSnapshot("s2", ["b"])
    cache.captureSnapshot("s3", ["c"])
    expect(cache.hasSnapshot("s1")).toBe(false)
    expect(cache.hasSnapshot("s2")).toBe(true)
    expect(cache.hasSnapshot("s3")).toBe(true)
  })
})
