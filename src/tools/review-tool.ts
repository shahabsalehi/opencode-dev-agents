import { tool } from "@opencode-ai/plugin/tool"
import { promises as fs } from "fs"
import { resolve, extname, join } from "path"
import { cwd } from "process"
import { codeAnalyzer } from "./code-analyzer.js"
import { bugDetector } from "./bug-detector.js"
import { discoverContextFiles } from "../context/context-scout.js"
import { fileContentCache, getFileCacheKey } from "../utils/cache.js"
import { wrapToolOutput } from "../validation/schema.js"
import { DEFAULTS, getConfig, resolveBoolean, resolveNumber, resolveString } from "../config.js"
import { mapWithLimit } from "../utils/concurrency.js"

type StyleIssue = {
  file: string
  trailingWhitespace: number
  tabIndentation: number
}

const CODE_EXTENSIONS = [
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".py",
  ".go",
  ".java",
  ".rb",
  ".php",
  ".rs"
]

export const reviewTool = tool({
  description: "Context-aware review that combines code analysis, bug detection, and style checks.",
  args: {
    scope: tool.schema.string().describe("File or directory to review"),
    focus: tool.schema.enum(["all", "security", "performance", "quality", "style"]).default("all").describe("Review focus area"),
    mode: tool.schema.enum(["fast", "balanced", "precise"]).default("precise").describe("Review precision mode"),
    minHighConfidenceRatio: tool.schema.number().min(0).max(1).default(0.7).describe("Minimum high+medium confidence ratio required for trusted verdict"),
    diffOnly: tool.schema.boolean().default(false).describe("Review only files changed since last run")
  },
  async execute(args, context) {
    const config = getConfig().tools?.reviewTool
    const analyzerConfig = getConfig().tools?.codeAnalyzer
    const detectorConfig = getConfig().tools?.bugDetector
    const resolvedFocus = resolveString(
      args.focus,
      config?.focus,
      DEFAULTS.tools.reviewTool.focus
    ) as "all" | "security" | "performance" | "quality" | "style"
    const resolvedDiffOnly = resolveBoolean(
      args.diffOnly,
      config?.diffOnly,
      DEFAULTS.tools.reviewTool.diffOnly
    )
    const resolvedMode = resolveString(
      args.mode,
      config?.mode,
      DEFAULTS.tools.reviewTool.mode
    ) as "fast" | "balanced" | "precise"
    const resolvedMinConfidence = resolveNumber(
      args.minHighConfidenceRatio,
      config?.minHighConfidenceRatio,
      DEFAULTS.tools.reviewTool.minHighConfidenceRatio
    )
    const { scope } = args
    const baseDir = context.directory || cwd()
    const targetPath = resolve(baseDir, scope)

    const contextFiles = await discoverContextFiles(baseDir)
    const contextPaths = contextFiles.map((file) => file.path.replace(baseDir, "").replace(/^\//, ""))

    const analysisOutput = resolvedFocus === "style"
      ? ""
      : await codeAnalyzer.execute({
          target: scope,
          mode: resolvedMode,
          threshold: analyzerConfig?.threshold ?? DEFAULTS.tools.codeAnalyzer.threshold,
          maxFiles: analyzerConfig?.maxFiles ?? DEFAULTS.tools.codeAnalyzer.maxFiles,
          diffOnly: resolvedDiffOnly
        }, context)

    const bugOutput = resolvedFocus === "quality" || resolvedFocus === "style"
      ? ""
      : await bugDetector.execute({
          scope,
          mode: resolvedMode,
          patterns: resolvedFocus === "security" ? ["security"] : ["security", "logic", "concurrency", "performance"],
          severity: resolvedFocus === "security" ? "high" : "medium",
          maxResults: detectorConfig?.maxResults ?? DEFAULTS.tools.bugDetector.maxResults,
          includeSuggestions: true,
          diffOnly: resolvedDiffOnly
        }, context)

    const styleIssues = resolvedFocus === "style" || resolvedFocus === "all"
      ? await checkStyleIssues(targetPath, baseDir)
      : []

    let output = "## Review Summary\n\n"
    output += `- **Scope:** ${scope}\n`
    output += `- **Focus:** ${resolvedFocus}\n`
    output += `- **Mode:** ${resolvedMode}\n`
    output += `- **Context files:** ${contextPaths.length > 0 ? contextPaths.join(", ") : "none"}\n\n`

    const analyzerSummary = parseToolSummary(analysisOutput)
    const detectorSummary = parseToolSummary(bugOutput)
    const analyzerRatio = extractHighConfidenceRatio(analyzerSummary)
    const detectorRatio = extractHighConfidenceRatio(detectorSummary)
    const observedRatios = [analyzerRatio, detectorRatio].filter((value): value is number => typeof value === "number")
    const overallHighConfidenceRatio = observedRatios.length > 0
      ? observedRatios.reduce((sum, value) => sum + value, 0) / observedRatios.length
      : 1
    const overallVerdict = overallHighConfidenceRatio >= resolvedMinConfidence ? "trusted" : "needs-review"
    output += `- **Confidence Verdict:** ${overallVerdict} (ratio=${overallHighConfidenceRatio.toFixed(2)}, threshold=${resolvedMinConfidence})\n\n`

    if (overallVerdict === "needs-review") {
      output += "⚠️ Review refused for production-grade sign-off: confidence evidence below threshold. Run in precise mode with language AST/LSP support installed.\n\n"
    }

    if (analysisOutput) {
      output += `## Code Analysis\n\n${analysisOutput}\n\n`
    }

    if (bugOutput) {
      output += `## Bug & Security Scan\n\n${bugOutput}\n\n`
    }

    if (styleIssues.length > 0) {
      output += "## Style Signals\n\n"
      for (const issue of styleIssues.slice(0, 10)) {
        output += `- ${issue.file}: ${issue.trailingWhitespace} trailing spaces, ${issue.tabIndentation} tab-indented lines\n`
      }
      if (styleIssues.length > 10) {
        output += `- ... and ${styleIssues.length - 10} more files\n`
      }
      output += "\n"
    }

    if (!analysisOutput && !bugOutput && styleIssues.length === 0) {
      output += "No review data available for the selected focus.\n"
    }

    return wrapToolOutput({
      summary: {
        scope,
        focus: resolvedFocus,
        contextFiles: contextPaths.length,
        styleIssues: styleIssues.length,
        mode: resolvedMode,
        overallVerdict,
        highConfidenceRatio: Number(overallHighConfidenceRatio.toFixed(2))
      },
      details: output,
      metadata: {
        tool: "reviewTool",
        focus: resolvedFocus
      }
    })
  }
})

async function checkStyleIssues(targetPath: string, baseDir: string): Promise<StyleIssue[]> {
  const stat = await fs.stat(targetPath).catch(() => null)
  if (!stat) return []

  const files: string[] = []
  if (stat.isFile()) {
    files.push(targetPath)
  } else if (stat.isDirectory()) {
    await walkDir(targetPath, files)
  }

  const results: StyleIssue[] = []
  await mapWithLimit(files, 6, async (file) => {
    const stats = await fs.stat(file)
    const contentKey = getFileCacheKey(file, stats.mtimeMs, "content")
    const cachedContent = fileContentCache.get(contentKey)?.value
    const content = cachedContent ?? await fs.readFile(file, "utf-8")
    if (!cachedContent) {
      fileContentCache.set(contentKey, { value: content, mtimeMs: stats.mtimeMs })
    }

    const lines = content.split("\n")
    let trailingWhitespace = 0
    let tabIndentation = 0
    for (const line of lines) {
      if (/\s+$/.test(line) && line.trim().length > 0) trailingWhitespace++
      if (/^\t+/.test(line)) tabIndentation++
    }

    if (trailingWhitespace > 0 || tabIndentation > 0) {
      results.push({
        file: file.replace(baseDir, "").replace(/^\//, ""),
        trailingWhitespace,
        tabIndentation
      })
    }
  })

  return results
}

function parseToolSummary(output: string): Record<string, unknown> | null {
  if (!output) return null
  try {
    const parsed = JSON.parse(output) as { summary?: Record<string, unknown> }
    return parsed.summary ?? null
  } catch {
    return null
  }
}

function extractHighConfidenceRatio(summary: Record<string, unknown> | null): number | undefined {
  if (!summary) return undefined
  const ratio = summary.highConfidenceRatio
  if (typeof ratio === "number") return ratio

  const confidence = summary.confidenceBreakdown
  const totalIssues = summary.totalIssues
  if (
    confidence && typeof confidence === "object" &&
    typeof totalIssues === "number" && totalIssues > 0
  ) {
    const c = confidence as Record<string, unknown>
    const high = typeof c.high === "number" ? c.high : 0
    const medium = typeof c.medium === "number" ? c.medium : 0
    return (high + medium) / totalIssues
  }

  if (typeof totalIssues === "number" && totalIssues === 0) return 1
  return undefined
}

async function walkDir(dir: string, results: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "build", "coverage"].includes(entry.name)) continue
      await walkDir(fullPath, results)
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase()
      if (CODE_EXTENSIONS.includes(ext)) {
        results.push(fullPath)
      }
    }
  }
}
