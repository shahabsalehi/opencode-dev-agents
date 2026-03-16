import { readFile } from "fs/promises"
import { join } from "path"
import { describe, expect, it } from "vitest"

describe("schema structure", () => {
  it("contains full top-level config keys", async () => {
    const file = join(process.cwd(), "swe-sworm.schema.json")
    const raw = await readFile(file, "utf-8")
    const schema = JSON.parse(raw) as {
      properties: Record<string, unknown>
    }

    const keys = Object.keys(schema.properties)
    expect(keys).toEqual(
      expect.arrayContaining([
        "mode",
        "tools",
        "context",
        "routing",
        "agentModels",
        "benchmarkProfile",
        "approval",
        "verification",
        "strictControl",
        "compatibility",
        "storage",
        "skills",
        "secondOpinion",
        "autopilot",
      ])
    )
  })

  it("declares mode enum values", async () => {
    const file = join(process.cwd(), "swe-sworm.schema.json")
    const raw = await readFile(file, "utf-8")
    const schema = JSON.parse(raw) as {
      properties: {
        mode?: {
          enum?: string[]
        }
      }
    }

    expect(schema.properties.mode?.enum).toEqual(["strict", "balanced", "research", "autopilot"])
  })
})
