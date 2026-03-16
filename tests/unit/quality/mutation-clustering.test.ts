import { describe, expect, it } from "vitest"
import { buildMutationClusters } from "../../../src/mutation/clustering.js"

describe("buildMutationClusters", () => {
  it("clusters files by module prefix", () => {
    const clusters = buildMutationClusters([
      "src/api/a.ts",
      "src/api/b.ts",
      "src/ui/x.tsx",
    ])
    expect(clusters.length).toBe(2)
    expect(clusters[0]?.files.length).toBeGreaterThan(0)
  })
})
