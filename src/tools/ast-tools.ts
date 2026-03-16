import { tool } from "@opencode-ai/plugin/tool"
import { promises as fs } from "fs"
import { resolve, extname } from "path"

const SUPPORTED_LANGUAGES = [
  "bash", "c", "cpp", "csharp", "css", "elixir", "go", "haskell",
  "html", "java", "javascript", "json", "kotlin", "lua", "nix",
  "php", "python", "ruby", "rust", "scala", "solidity", "swift",
  "typescript", "tsx", "yaml"
] as const

type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]

interface ASTMatch {
  file: string
  line: number
  column: number
  text: string
  captures: Record<string, string>
}

interface CompiledPattern {
  regex: RegExp
  variableNames: string[]
  hasVariadic: boolean
}

function detectLanguage(filePath: string): SupportedLanguage | null {
  const ext = extname(filePath).toLowerCase()
  const map: Record<string, SupportedLanguage> = {
    ".sh": "bash", ".bash": "bash",
    ".c": "c",
    ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp",
    ".cs": "csharp",
    ".css": "css", ".scss": "css", ".sass": "css",
    ".ex": "elixir", ".exs": "elixir",
    ".go": "go",
    ".hs": "haskell",
    ".html": "html", ".htm": "html",
    ".java": "java",
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript",
    ".json": "json",
    ".kt": "kotlin",
    ".lua": "lua",
    ".nix": "nix",
    ".php": "php",
    ".py": "python",
    ".rb": "ruby",
    ".rs": "rust",
    ".scala": "scala", ".sc": "scala",
    ".sol": "solidity",
    ".swift": "swift",
    ".ts": "typescript", ".tsx": "tsx",
    ".yaml": "yaml", ".yml": "yaml"
  }
  return map[ext] || null
}

function escapeRegexLiteral(ch: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(ch) ? `\\${ch}` : ch
}

function compilePattern(pattern: string): CompiledPattern {
  const variableNames: string[] = []
  let hasVariadic = false
  let source = ""

  let i = 0
  while (i < pattern.length) {
    if (pattern.startsWith("$$$", i)) {
      hasVariadic = true
      source += "([\\s\\S]*?)"
      i += 3
      continue
    }

    if (pattern[i] === "$") {
      const rest = pattern.slice(i + 1)
      const nameMatch = /^([A-Z][A-Z0-9_]*)/.exec(rest)
      if (nameMatch) {
        const name = nameMatch[1]
        variableNames.push(name)
        source += "([A-Za-z_][A-Za-z0-9_]*)"
        i += 1 + name.length
        continue
      }
    }

    source += escapeRegexLiteral(pattern[i])
    i++
  }

  return {
    regex: new RegExp(source, "g"),
    variableNames,
    hasVariadic
  }
}

function getLineAndColumn(content: string, index: number): { line: number; column: number } {
  const prefix = content.slice(0, index)
  const line = prefix.split("\n").length
  const lastBreak = prefix.lastIndexOf("\n")
  const column = lastBreak === -1 ? index : index - lastBreak - 1
  return { line, column: Math.max(0, column) }
}

function collectMatches(content: string, filePath: string, compiled: CompiledPattern, maxResults: number): ASTMatch[] {
  const matches: ASTMatch[] = []
  let match: RegExpExecArray | null

  while ((match = compiled.regex.exec(content)) !== null) {
    const position = getLineAndColumn(content, match.index)
    const captures: Record<string, string> = {}

    let groupIndex = 1
    if (compiled.hasVariadic) {
      captures.$$$ = match[groupIndex] || ""
      groupIndex++
    }

    for (const name of compiled.variableNames) {
      captures[`$${name}`] = match[groupIndex] || ""
      groupIndex++
    }

    matches.push({
      file: filePath,
      line: position.line,
      column: position.column,
      text: match[0].slice(0, 300),
      captures
    })

    if (matches.length >= maxResults) {
      break
    }
  }

  return matches
}

function applyRewriteTemplate(rewrite: string, captures: Record<string, string>): string {
  let output = rewrite
  for (const [name, value] of Object.entries(captures)) {
    output = output.split(name).join(value)
  }
  return output
}

async function* walkDir(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory() && !["node_modules", ".git", "dist", "build", "coverage"].includes(entry.name)) {
      yield* walkDir(fullPath)
    } else if (entry.isFile()) {
      yield fullPath
    }
  }
}

async function listCandidateFiles(paths: string[], globs: string[], baseDir: string, lang: SupportedLanguage): Promise<string[]> {
  const files = new Set<string>()

  for (const p of paths) {
    try {
      const stat = await fs.stat(p)
      if (stat.isFile()) {
        files.add(p)
      } else if (stat.isDirectory()) {
        for await (const file of walkDir(p)) {
          files.add(file)
        }
      }
    } catch {
      continue
    }
  }

  if (globs.length > 0) {
    for (const g of globs) {
      try {
        const { glob } = await import("glob")
        const globFiles = await glob(g, { cwd: baseDir, absolute: true })
        globFiles.forEach((f: string) => files.add(f))
      } catch {
        continue
      }
    }
  }

  const filtered = Array.from(files).filter((file) => detectLanguage(file) === lang)
  filtered.sort()
  return filtered
}

async function searchFiles(
  pattern: string,
  lang: SupportedLanguage,
  paths: string[],
  globs: string[],
  maxResults: number,
  baseDir: string
): Promise<ASTMatch[]> {
  const compiled = compilePattern(pattern)
  const matches: ASTMatch[] = []
  const files = await listCandidateFiles(paths, globs, baseDir, lang)

  for (const file of files) {
    if (matches.length >= maxResults) break
    try {
      const content = await fs.readFile(file, "utf-8")
      const found = collectMatches(content, file, compiled, maxResults - matches.length)
      matches.push(...found)
    } catch {
      continue
    }
  }

  return matches
}

async function replaceFiles(
  pattern: string,
  rewrite: string,
  lang: SupportedLanguage,
  paths: string[],
  globs: string[],
  dryRun: boolean,
  baseDir: string
): Promise<{
  totalMatches: number
  filesChanged: number
  preview: Array<{ file: string; line: number; before: string; after: string }>
}> {
  const compiled = compilePattern(pattern)
  const files = await listCandidateFiles(paths, globs, baseDir, lang)

  let totalMatches = 0
  let filesChanged = 0
  const preview: Array<{ file: string; line: number; before: string; after: string }> = []

  for (const file of files) {
    let content: string
    try {
      content = await fs.readFile(file, "utf-8")
    } catch {
      continue
    }

    const fileMatches = collectMatches(content, file, compiled, 500)
    if (fileMatches.length === 0) {
      continue
    }

    totalMatches += fileMatches.length

    for (const item of fileMatches.slice(0, 5)) {
      preview.push({
        file: item.file,
        line: item.line,
        before: item.text.slice(0, 140),
        after: applyRewriteTemplate(rewrite, item.captures).slice(0, 140)
      })
    }

    let changed = false
    const replaced = content.replace(compiled.regex, (...args: unknown[]) => {
      const groups = args.slice(1, args.length - 2) as string[]
      const captures: Record<string, string> = {}
      let index = 0

      if (compiled.hasVariadic) {
        captures.$$$ = groups[index] || ""
        index++
      }

      for (const name of compiled.variableNames) {
        captures[`$${name}`] = groups[index] || ""
        index++
      }

      changed = true
      return applyRewriteTemplate(rewrite, captures)
    })

    if (changed) {
      filesChanged++
      if (!dryRun) {
        await fs.writeFile(file, replaced, "utf-8")
      }
    }
  }

  return { totalMatches, filesChanged, preview }
}

export const astGrepSearch = tool({
  description: "Search code patterns using AST-grep style variables ($VAR, $$$) with language-filtered regex matching.",
  args: {
    pattern: tool.schema.string().describe("Pattern with meta-variables like $VAR (identifier) or $$$ (free-form segment)"),
    lang: tool.schema.enum(SUPPORTED_LANGUAGES).describe("Target language for file filtering"),
    paths: tool.schema.array(tool.schema.string()).optional().describe("Files or directories to search"),
    globs: tool.schema.array(tool.schema.string()).optional().describe("Glob patterns for file selection")
  },
  async execute(args, context) {
    const { pattern, lang, paths = [], globs = [] } = args
    const baseDir = context.directory || process.cwd()

    const resolvedPaths = paths.length > 0
      ? paths.map((p) => resolve(baseDir, p))
      : [baseDir]

    try {
      const matches = await searchFiles(pattern, lang, resolvedPaths, globs, 100, baseDir)

      if (matches.length === 0) {
        return "No matches found. Try simplifying your pattern or adjusting path/lang filters."
      }

      let output = "## Pattern Search Results\n\n"
      output += `**Pattern:** \`${pattern}\`\n`
      output += `**Language:** ${lang}\n`
      output += `**Matches:** ${matches.length}\n\n`

      for (const match of matches.slice(0, 20)) {
        output += `### ${match.file}:${match.line}:${match.column}\n\n`
        output += "```\n"
        output += match.text
        output += "\n```\n\n"
      }

      if (matches.length > 20) {
        output += `*... and ${matches.length - 20} more matches*\n`
      }

      return output
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  }
})

export const astGrepReplace = tool({
  description: "Replace code patterns using AST-grep style variables ($VAR, $$$) with language-filtered regex matching.",
  args: {
    pattern: tool.schema.string().describe("Pattern to match"),
    rewrite: tool.schema.string().describe("Replacement template with variables like $VAR and $$$"),
    dryRun: tool.schema.boolean().default(true).describe("Preview changes without writing"),
    lang: tool.schema.enum(SUPPORTED_LANGUAGES).describe("Target language for file filtering"),
    paths: tool.schema.array(tool.schema.string()).optional().describe("Files or directories"),
    globs: tool.schema.array(tool.schema.string()).optional().describe("Glob patterns")
  },
  async execute(args, context) {
    const { pattern, rewrite, dryRun, lang, paths = [], globs = [] } = args
    const baseDir = context.directory || process.cwd()

    const resolvedPaths = paths.length > 0
      ? paths.map((p) => resolve(baseDir, p))
      : [baseDir]

    try {
      const result = await replaceFiles(pattern, rewrite, lang, resolvedPaths, globs, dryRun, baseDir)

      if (result.totalMatches === 0) {
        return "No matches found for replacement."
      }

      let output = "## Pattern Replace Report\n\n"
      output += `**Pattern:** \`${pattern}\`\n`
      output += `**Rewrite:** \`${rewrite}\`\n`
      output += `**Language:** ${lang}\n`
      output += `**Mode:** ${dryRun ? "Dry Run (no changes)" : "Live (changes written)"}\n`
      output += `**Matches:** ${result.totalMatches}\n`
      output += `**Files Changed:** ${result.filesChanged}\n\n`

      for (const item of result.preview.slice(0, 10)) {
        output += `### ${item.file}:${item.line}\n`
        output += "```diff\n"
        output += `- ${item.before}\n`
        output += `+ ${item.after}\n`
        output += "```\n\n"
      }

      if (!dryRun) {
        output += "Applied requested replacements.\n"
      }

      return output
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  }
})
