import { readdir, readFile } from "fs/promises"
import { join } from "path"
import { describe, expect, it } from "vitest"

const profilesDir = join(process.cwd(), "suggested-profiles")

describe("suggested profiles", () => {
  it("ships 8 profile configs with valid top-level structure", async () => {
    const files = (await readdir(profilesDir)).filter((name) => name.endsWith(".json"))
    expect(files.length).toBe(8)

    for (const file of files) {
      const raw = await readFile(join(profilesDir, file), "utf-8")
      const parsed = JSON.parse(raw) as {
        plugin?: {
          "swe-sworm"?: {
            mode?: string
            profile?: string
            benchmarkProfile?: string
          }
        }
      }
      const config = parsed.plugin?.["swe-sworm"]
      expect(config).toBeDefined()
      expect(["strict", "balanced", "research"]).toContain(config?.mode)
      expect(["strict", "balanced", "research", "custom"]).toContain(config?.profile)
      expect(["poor", "rich"]).toContain(config?.benchmarkProfile)
    }
  })
})
