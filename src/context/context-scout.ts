import { promises as fs } from "fs"
import { join, resolve } from "path"

type ContextFile = {
  path: string
  content: string
  kind: "core" | "workflow" | "domain" | "project"
}

const CONTEXT_DIRS = [
  "core",
  "workflows",
  "development",
  "ui",
  "project-intelligence"
]

export async function discoverContextFiles(baseDir: string): Promise<ContextFile[]> {
  const root = resolve(baseDir, ".opencode", "context")
  const results: ContextFile[] = []

  for (const dir of CONTEXT_DIRS) {
    const fullDir = join(root, dir)
    const entries = await fs.readdir(fullDir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!entry.name.endsWith(".md")) continue
      const filePath = join(fullDir, entry.name)
      const content = await fs.readFile(filePath, "utf-8")
      results.push({
        path: filePath,
        content,
        kind: mapKind(dir)
      })
    }
  }

  return results
}

function mapKind(dir: string): ContextFile["kind"] {
  if (dir === "core") return "core"
  if (dir === "workflows") return "workflow"
  if (dir === "project-intelligence") return "project"
  return "domain"
}

export function applyMviContext(files: ContextFile[], maxLinesPerFile: number = 80): string[] {
  return files.map((file) => {
    const lines = file.content.split("\n").slice(0, maxLinesPerFile)
    return `## Context (${file.kind})\n${lines.join("\n")}`
  })
}
