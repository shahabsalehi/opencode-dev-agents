import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { describe, expect, it } from "vitest"
import { loadSkillsFromDirectory } from "../../../src/skills/loader.js"
import { SkillsRegistry } from "../../../src/skills/registry.js"

describe("skills loader", () => {
  it("loads valid skill json files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swe-skill-loader-"))
    const skillsDir = join(directory, ".opencode", "skills")
    await mkdir(skillsDir, { recursive: true })
    await writeFile(
      join(skillsDir, "safe-refactor.json"),
      JSON.stringify({
        name: "safe-refactor",
        description: "desc",
        prompt: "prompt",
        riskLevel: "medium",
      })
    )

    const registry = new SkillsRegistry()
    const loaded = await loadSkillsFromDirectory(directory, registry)
    expect(loaded).toBe(1)
    expect(registry.has("safe-refactor")).toBe(true)

    await rm(directory, { recursive: true, force: true })
  })

  it("skips invalid entries and handles missing directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swe-skill-loader-"))
    const registry = new SkillsRegistry()
    const loadedMissing = await loadSkillsFromDirectory(directory, registry)
    expect(loadedMissing).toBe(0)

    const skillsDir = join(directory, ".opencode", "skills")
    await mkdir(skillsDir, { recursive: true })
    await writeFile(join(skillsDir, "bad.json"), "{not-json")

    const loadedInvalid = await loadSkillsFromDirectory(directory, registry)
    expect(loadedInvalid).toBe(0)

    await rm(directory, { recursive: true, force: true })
  })
})
