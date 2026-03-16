import { describe, expect, it } from "vitest"
import { LruCache, getFileCacheKey } from "../../../src/utils/cache.js"

describe("utils cache eviction", () => {
  it("evicts least recently used entry when over capacity", () => {
    const cache = new LruCache<string, number>(2)
    cache.set("a", { value: 1 })
    cache.set("b", { value: 2 })
    cache.get("a")
    cache.set("c", { value: 3 })

    expect(cache.get("a")?.value).toBe(1)
    expect(cache.get("b")).toBeUndefined()
    expect(cache.get("c")?.value).toBe(3)
  })

  it("builds file cache keys with and without suffix", () => {
    expect(getFileCacheKey("src/a.ts", 123)).toBe("src/a.ts:123")
    expect(getFileCacheKey("src/a.ts", 123, "lint")).toBe("src/a.ts:123:lint")
  })
})
