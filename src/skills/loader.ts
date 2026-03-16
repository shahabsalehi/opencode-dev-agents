import { readdir, readFile } from "fs/promises"
import { join } from "path"
import type { SkillsRegistry } from "./registry.js"
import { validateSkillDefinition } from "./schema.js"

export async function loadSkillsFromDirectory(
  baseDir: string,
  registry: SkillsRegistry,
  relativeDirectory = ".opencode/skills"
): Promise<number> {
  const files = await listSkillFiles(baseDir, relativeDirectory)
  let loaded = 0

  for (const file of files) {
    try {
      const content = await readFile(file, "utf-8")
      const parsed = JSON.parse(content) as unknown
      const validation = validateSkillDefinition(parsed)
      if (!validation.valid || !validation.skill) {
        continue
      }
      registry.register(validation.skill)
      loaded++
    } catch {
      continue
    }
  }

  return loaded
}

async function listSkillFiles(baseDir: string, relativeDirectory: string): Promise<string[]> {
  const directory = join(baseDir, relativeDirectory)
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(directory, entry.name))
  } catch {
    return []
  }
}
