import { tool } from "@opencode-ai/plugin/tool"
import { promises as fs } from "fs"
import { resolve, relative } from "path"
import ts from "typescript"
import { analysisCache, fileContentCache, getFileCacheKey } from "../utils/cache.js"
import { wrapToolOutput } from "../validation/schema.js"
import { DEFAULTS, getConfig, resolveBoolean, resolveNumber, resolveString } from "../config.js"
import { mapWithLimit } from "../utils/concurrency.js"

/**
 * Bug Detector Tool
 * 
 * Detects common bug patterns and potential issues in code:
 * - Security vulnerabilities
 * - Logic errors
 * - Concurrency issues
 * - Resource leaks
 * - API misuse
 */

interface BugPattern {
  id: string
  name: string
  category: "security" | "logic" | "performance" | "concurrency" | "resource" | "api"
  severity: "low" | "medium" | "high" | "critical"
  description: string
  fix: string
  languages: string[]
  pattern: RegExp
  antiPattern?: RegExp
}

interface DetectedBug {
  pattern: string
  filePath: string
  line: number
  column: number
  severity: BugPattern["severity"]
  category: BugPattern["category"]
  description: string
  fix: string
  snippet: string
  confidence: "high" | "medium" | "low" | "heuristic"
  evidence: string
  verification: "ast+lsp" | "ast" | "lsp" | "regex"
}

type AnalysisMode = "fast" | "balanced" | "precise"

type TsInsights = {
  sourceFile: ts.SourceFile
  diagnostics: Array<{ line: number; message: string }>
}

// Comprehensive bug patterns database
const bugPatterns: BugPattern[] = [
  // Security patterns
  {
    id: "SEC-001",
    name: "Unsafe eval usage",
    category: "security",
    severity: "critical",
    description: "eval() can execute arbitrary code and lead to code injection attacks",
    fix: "Use JSON.parse() for parsing JSON, or safer alternatives for dynamic code execution",
    languages: ["javascript", "typescript"],
    pattern: /\beval\s*\(/i
  },
  {
    id: "SEC-002",
    name: "Unsafe innerHTML",
    category: "security",
    severity: "critical",
    description: "Assigning to innerHTML can lead to XSS vulnerabilities",
    fix: "Use textContent for plain text, or sanitize HTML before assignment",
    languages: ["javascript", "typescript"],
    pattern: /\.innerHTML\s*=/i
  },
  {
    id: "SEC-003",
    name: "Unsafe document.write",
    category: "security",
    severity: "high",
    description: "document.write() is unsafe and can lead to XSS",
    fix: "Use DOM manipulation methods like createElement and appendChild",
    languages: ["javascript", "typescript"],
    pattern: /document\.write\s*\(/i
  },
  {
    id: "SEC-004",
    name: "SQL Injection risk",
    category: "security",
    severity: "critical",
    description: "String concatenation in SQL queries can lead to SQL injection",
    fix: "Use parameterized queries or prepared statements",
    languages: ["javascript", "typescript", "python", "go", "java"],
    pattern: /(?:query|execute|exec)\s*\(\s*[`"'].*\$\{|\?\s*\+|\+\s*[`"']/i
  },
  {
    id: "SEC-005",
    name: "Hardcoded secrets",
    category: "security",
    severity: "critical",
    description: "Secrets should not be hardcoded in source code",
    fix: "Use environment variables or secure secret management",
    languages: ["*"],
    pattern: /(?:password|secret|api[_-]?key|token)\s*[=:]\s*["'][^"']{8,}["']/i,
    antiPattern: /process\.env|os\.getenv|System\.getenv/
  },
  {
    id: "SEC-006",
    name: "Insecure randomness",
    category: "security",
    severity: "high",
    description: "Math.random() is not cryptographically secure",
    fix: "Use crypto.getRandomValues() or crypto.randomBytes() for security-sensitive operations",
    languages: ["javascript", "typescript"],
    pattern: /Math\.random\s*\(/i
  },
  {
    id: "SEC-007",
    name: "Disabled certificate validation",
    category: "security",
    severity: "critical",
    description: "Disabling certificate validation makes connections vulnerable to MITM attacks",
    fix: "Remove rejectUnauthorized: false or verify=False and use valid certificates",
    languages: ["javascript", "typescript", "python"],
    pattern: /rejectUnauthorized\s*:\s*false|verify\s*=\s*False/i
  },

  // Logic errors
  {
    id: "LOG-001",
    name: "Assignment in condition",
    category: "logic",
    severity: "high",
    description: "Using = instead of == or === in a condition is likely a bug",
    fix: "Use == or === for comparison, or wrap assignment in parentheses if intentional",
    languages: ["javascript", "typescript", "c", "cpp", "java"],
    pattern: /\bif\s*\(\s*\w+\s*=\s*[^=]/
  },
  {
    id: "LOG-002",
    name: "Unreachable code",
    category: "logic",
    severity: "medium",
    description: "Code after return statement will never execute",
    fix: "Remove unreachable code or move it before the return statement",
    languages: ["javascript", "typescript", "python", "go"],
    pattern: /return[^;]*;\s*[^{}]+(?=\}|$)/s
  },
  {
    id: "LOG-003",
    name: "Off-by-one error risk",
    category: "logic",
    severity: "medium",
    description: "Array access pattern may lead to off-by-one errors",
    fix: "Double-check array bounds and use appropriate comparison operators",
    languages: ["javascript", "typescript", "python", "go", "java", "c", "cpp"],
    pattern: /\[\s*\w+\s*\.\s*length\s*\]/
  },
  {
    id: "LOG-004",
    name: "Null pointer dereference",
    category: "logic",
    severity: "high",
    description: "Potential null or undefined access",
    fix: "Add null checks before accessing properties",
    languages: ["javascript", "typescript", "java", "c", "cpp"],
    pattern: /\w+\?\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*\.|\w+\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*\.(?!\?)/
  },
  {
    id: "LOG-005",
    name: "Infinite loop risk",
    category: "logic",
    severity: "high",
    description: "Loop condition may never become false",
    fix: "Ensure loop has a proper termination condition",
    languages: ["javascript", "typescript", "python", "go", "java", "c", "cpp"],
    pattern: /while\s*\(\s*true\s*\)|for\s*\(\s*;?\s*;\s*\)/
  },
  {
    id: "LOG-006",
    name: "Floating point comparison",
    category: "logic",
    severity: "low",
    description: "Direct comparison of floating point numbers may be unreliable",
    fix: "Use epsilon comparison: Math.abs(a - b) < epsilon",
    languages: ["javascript", "typescript", "python", "go", "java", "c", "cpp"],
    pattern: /\d+\.\d+\s*===?\s*\d+\.\d+/
  },

  // Concurrency issues
  {
    id: "CON-001",
    name: "Race condition risk",
    category: "concurrency",
    severity: "high",
    description: "Potential race condition in async code",
    fix: "Use proper synchronization mechanisms like locks, mutexes, or atomic operations",
    languages: ["javascript", "typescript", "go", "python"],
    pattern: /await\s+\w+.*\n.*\w+\s*=.*\w+.*\n.*await/i
  },
  {
    id: "CON-002",
    name: "Missing await",
    category: "concurrency",
    severity: "high",
    description: "Promise is created but not awaited, may cause unhandled rejections",
    fix: "Add await keyword or handle the promise with .catch()",
    languages: ["javascript", "typescript"],
    pattern: /(?:async\s+)?\w+\s*\([^)]*\)(?!\s*await|\s*\.catch|\s*\.then)[^;]*;(?![^}]*await)/
  },
  {
    id: "CON-003",
    name: "Deadlock risk",
    category: "concurrency",
    severity: "high",
    description: "Potential deadlock due to lock ordering",
    fix: "Ensure locks are always acquired in the same order",
    languages: ["go", "java", "python"],
    pattern: /Lock\(\).*Lock\(\)/s
  },

  // Resource leaks
  {
    id: "RES-001",
    name: "Unclosed file handle",
    category: "resource",
    severity: "medium",
    description: "File is opened but may not be closed",
    fix: "Use 'with' statement (Python) or try-finally to ensure file is closed",
    languages: ["python"],
    pattern: /open\s*\([^)]+\)(?!.*close)/s
  },
  {
    id: "RES-002",
    name: "Missing cleanup in callback",
    category: "resource",
    severity: "medium",
    description: "Event listener added but may never be removed",
    fix: "Remove event listeners when component unmounts or on cleanup",
    languages: ["javascript", "typescript"],
    pattern: /\.addEventListener\s*\(/i
  },
  {
    id: "RES-003",
    name: "Memory leak in closure",
    category: "resource",
    severity: "medium",
    description: "Closure may capture large objects preventing garbage collection",
    fix: "Avoid capturing large objects in long-lived closures",
    languages: ["javascript", "typescript"],
    pattern: /setInterval\s*\(\s*(?:\(\)|function).*\{[^{}]*\w+\.[a-zA-Z_$]/
  },

  // Performance issues
  {
    id: "PERF-001",
    name: "Inefficient loop",
    category: "performance",
    severity: "low",
    description: "Array length accessed on every iteration",
    fix: "Cache array.length in a variable before the loop",
    languages: ["javascript", "typescript"],
    pattern: /for\s*\(\s*var\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*\w+\.length\s*;/
  },
  {
    id: "PERF-002",
    name: "Synchronous file operations",
    category: "performance",
    severity: "medium",
    description: "Synchronous file operations block the event loop",
    fix: "Use asynchronous file operations",
    languages: ["javascript", "typescript"],
    pattern: /readFileSync|writeFileSync|appendFileSync/i
  },
  {
    id: "PERF-003",
    name: "N+1 query pattern",
    category: "performance",
    severity: "high",
    description: "Database queries inside loops cause N+1 query problem",
    fix: "Use batch queries or eager loading",
    languages: ["javascript", "typescript", "python", "go"],
    pattern: /for\s*\([^)]*\)\s*\{[^}]*(?:query|find|select|execute)/is
  },

  // API misuse
  {
    id: "API-001",
    name: "Deprecated API usage",
    category: "api",
    severity: "low",
    description: "Using deprecated API that may be removed in future versions",
    fix: "Migrate to the recommended replacement API",
    languages: ["javascript", "typescript", "python"],
    pattern: /\.substr\s*\(|\.escape\s*\(|async\.forEach/i
  },
  {
    id: "API-002",
    name: "Incorrect error handling",
    category: "api",
    severity: "medium",
    description: "Empty catch block or catch without proper handling",
    fix: "Add proper error handling or logging in catch blocks",
    languages: ["javascript", "typescript"],
    pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/
  }
]

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    'js': 'javascript', 'ts': 'typescript', 'jsx': 'javascript', 'tsx': 'typescript',
    'py': 'python',
    'go': 'go',
    'java': 'java',
    'c': 'c', 'cpp': 'cpp', 'cc': 'cpp', 'h': 'c', 'hpp': 'cpp'
  }
  return map[ext || ''] || 'unknown'
}

async function analyzeFile(
  filePath: string, 
  content: string, 
  patterns: BugPattern[],
  minSeverity: string,
  mode: AnalysisMode,
  packageWarnings: Set<string>
): Promise<DetectedBug[]> {
  const detected: DetectedBug[] = []
  const lines = content.split('\n')
  const language = detectLanguage(filePath)
  const tsInsights = getTsInsights(filePath, content, language, mode, packageWarnings)
  
  for (const pattern of patterns) {
    // Skip if pattern doesn't apply to this language
    if (!pattern.languages.includes('*') && !pattern.languages.includes(language)) {
      continue
    }
    
    // Skip if severity filter applies
    if (minSeverity !== 'all') {
      const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 }
      if (severityOrder[pattern.severity] < severityOrder[minSeverity as keyof typeof severityOrder]) {
        continue
      }
    }
    
    let match
    const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags.includes('g') 
      ? pattern.pattern.flags 
      : pattern.pattern.flags + 'g')
    
    while ((match = regex.exec(content)) !== null) {
      // Check anti-pattern (should not exist)
      if (pattern.antiPattern) {
        const antiMatch = content.match(pattern.antiPattern)
        if (antiMatch) continue
      }
      
      // Calculate line and column
      const index = match.index
      const lineNum = content.substring(0, index).split('\n').length
      const column = index - content.lastIndexOf('\n', index - 1)
      
      // Get context (surrounding lines)
      const startLine = Math.max(0, lineNum - 2)
      const endLine = Math.min(lines.length, lineNum + 2)
      const snippet = lines.slice(startLine, endLine).join('\n')
      const verification = verifyPattern(pattern.id, language, tsInsights, lineNum)
      const confidence = resolveConfidence(mode, verification)
      const evidence = buildEvidence(pattern.id, snippet, verification, tsInsights, lineNum)
      
      detected.push({
        pattern: pattern.id,
        filePath,
        line: lineNum,
        column,
        severity: pattern.severity,
        category: pattern.category,
        description: pattern.description,
        fix: pattern.fix,
        snippet: snippet.trim(),
        confidence,
        evidence,
        verification
      })
    }
  }
  
  return detected
}

function resolveConfidence(mode: AnalysisMode, verification: DetectedBug["verification"]): DetectedBug["confidence"] {
  if (mode === "fast") return "heuristic"
  if (verification === "ast+lsp") return "high"
  if (verification === "ast") return mode === "precise" ? "medium" : "high"
  if (verification === "lsp") return mode === "precise" ? "medium" : "medium"
  return mode === "precise" ? "low" : "heuristic"
}

function buildEvidence(
  patternId: string,
  snippet: string,
  verification: DetectedBug["verification"],
  tsInsights: TsInsights | null,
  line: number
): string {
  const trimmedSnippet = snippet.trim().slice(0, 260)
  if (verification === "ast+lsp" && tsInsights) {
    const diagnostic = tsInsights.diagnostics.find((item) => Math.abs(item.line - line) <= 1)
    const suffix = diagnostic ? ` | LSP: ${diagnostic.message.slice(0, 140)}` : ""
    return `AST verified ${patternId}. Snippet: ${trimmedSnippet}${suffix}`
  }
  if (verification === "ast") {
    return `AST verified ${patternId}. Snippet: ${trimmedSnippet}`
  }
  if (verification === "lsp" && tsInsights) {
    const diagnostic = tsInsights.diagnostics.find((item) => Math.abs(item.line - line) <= 1)
    if (diagnostic) return `LSP diagnostic near finding: ${diagnostic.message.slice(0, 180)}`
  }
  return `Regex heuristic match for ${patternId}. Snippet: ${trimmedSnippet}`
}

function getTsInsights(
  filePath: string,
  content: string,
  language: string,
  mode: AnalysisMode,
  packageWarnings: Set<string>
): TsInsights | null {
  if (!["typescript", "javascript"].includes(language)) {
    if (mode !== "fast") {
      maybeWarnMissingLanguageSupport(language, packageWarnings)
    }
    return null
  }

  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)
  if (mode === "balanced") return { sourceFile, diagnostics: [] }

  const diagnostics = getTypeScriptDiagnostics(filePath, content)
  return {
    sourceFile,
    diagnostics
  }
}

function getTypeScriptDiagnostics(filePath: string, content: string): Array<{ line: number; message: string }> {
  try {
    const compilerOptions: ts.CompilerOptions = {
      allowJs: true,
      checkJs: true,
      noEmit: true,
      skipLibCheck: true,
      strict: false,
      target: ts.ScriptTarget.ES2020,
      moduleResolution: ts.ModuleResolutionKind.NodeJs
    }
    const host = ts.createCompilerHost(compilerOptions, true)
    const originalReadFile = host.readFile.bind(host)
    const originalFileExists = host.fileExists.bind(host)

    host.readFile = (name) => {
      if (resolve(name) === resolve(filePath)) return content
      return originalReadFile(name)
    }
    host.fileExists = (name) => {
      if (resolve(name) === resolve(filePath)) return true
      return originalFileExists(name)
    }

    const program = ts.createProgram([filePath], compilerOptions, host)
    const source = program.getSourceFile(filePath)
    if (!source) return []

    return ts
      .getPreEmitDiagnostics(program, source)
      .filter((diag) => typeof diag.start === "number")
      .slice(0, 20)
      .map((diag) => {
        const position = source.getLineAndCharacterOfPosition(diag.start ?? 0)
        return {
          line: position.line + 1,
          message: ts.flattenDiagnosticMessageText(diag.messageText, " ")
        }
      })
  } catch {
    return []
  }
}

function verifyPattern(
  patternId: string,
  language: string,
  insights: TsInsights | null,
  line: number
): DetectedBug["verification"] {
  if (!["typescript", "javascript"].includes(language) || !insights) {
    return "regex"
  }

  const astVerified = hasAstEvidence(patternId, insights.sourceFile, line)
  const lspVerified = insights.diagnostics.some((diag) => Math.abs(diag.line - line) <= 1)
  if (astVerified && lspVerified) return "ast+lsp"
  if (astVerified) return "ast"
  if (lspVerified) return "lsp"
  return "regex"
}

function hasAstEvidence(patternId: string, sourceFile: ts.SourceFile, line: number): boolean {
  let matched = false
  const visit = (node: ts.Node): void => {
    if (matched) return
    const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
    if (Math.abs(pos - line) > 1) {
      ts.forEachChild(node, visit)
      return
    }

    if (patternId === "SEC-001" && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "eval") {
      matched = true
      return
    }
    if (patternId === "SEC-002" && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = node.left
      if (ts.isPropertyAccessExpression(left) && left.name.text === "innerHTML") {
        matched = true
        return
      }
    }
    if (patternId === "SEC-003" && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const expr = node.expression
      if (ts.isIdentifier(expr.expression) && expr.expression.text === "document" && expr.name.text === "write") {
        matched = true
        return
      }
    }
    if (patternId === "API-002" && ts.isCatchClause(node) && node.block.statements.length === 0) {
      matched = true
      return
    }
    if (patternId === "PERF-002" && ts.isCallExpression(node)) {
      const callee = node.expression.getText(sourceFile)
      if (callee.endsWith("readFileSync") || callee.endsWith("writeFileSync") || callee.endsWith("appendFileSync")) {
        matched = true
        return
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return matched
}

function maybeWarnMissingLanguageSupport(language: string, packageWarnings: Set<string>): void {
  if (["unknown", "javascript", "typescript"].includes(language)) return
  const pkg = treeSitterPackageFor(language)
  if (!pkg) {
    packageWarnings.add(`No parser package mapping for '${language}'. Install a Tree-sitter language package to enable AST precision.`)
    return
  }
  packageWarnings.add(`AST/LSP precision unavailable for '${language}'. Install package '${pkg}' to avoid heuristic-only results.`)
}

function treeSitterPackageFor(language: string): string | null {
  const map: Record<string, string> = {
    python: "tree-sitter-python",
    go: "tree-sitter-go",
    java: "tree-sitter-java",
    c: "tree-sitter-c",
    cpp: "tree-sitter-cpp"
  }
  return map[language] ?? null
}

// Simple glob implementation using fs
async function findFiles(dir: string, _pattern: string): Promise<string[]> {
  const files: string[] = []
  const extensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.java', '.c', '.cpp', '.cc', '.h', '.hpp']
  
  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = resolve(currentDir, entry.name)
      
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await walk(fullPath)
      } else if (entry.isFile()) {
        const ext = entry.name.slice(entry.name.lastIndexOf('.'))
        if (extensions.includes(ext)) {
          files.push(fullPath)
        }
      }
    }
  }
  
  await walk(dir)
  return files
}

export const bugDetector = tool({
  description: "Detects common bug patterns, security vulnerabilities, and code issues. Uses pattern matching to identify potential problems before they become bugs.",
  args: {
    scope: tool.schema.string().describe("File, directory, or glob pattern to analyze (relative to current directory)"),
    mode: tool.schema.enum(["fast", "balanced", "precise"]).default("precise").describe("Detection mode: fast (regex), balanced (regex+AST when available), precise (regex+AST+LSP with strict confidence)"),
    patterns: tool.schema.array(
      tool.schema.enum(["security", "logic", "performance", "concurrency", "resource", "api"])
    ).default(["security", "logic", "concurrency"]).describe("Categories of bugs to detect"),
    severity: tool.schema.enum(["all", "low", "medium", "high", "critical"]).default("all").describe("Minimum severity level to report"),
    maxResults: tool.schema.number().min(1).max(500).default(100).describe("Maximum number of issues to report"),
    includeSuggestions: tool.schema.boolean().default(true).describe("Include fix suggestions for each issue"),
    diffOnly: tool.schema.boolean().default(false).describe("Analyze only files changed since last run")
  },
  async execute(args, context) {
    const config = getConfig().tools?.bugDetector
    const resolvedSeverity = resolveString(
      args.severity,
      config?.severity,
      DEFAULTS.tools.bugDetector.severity
    ) as typeof DEFAULTS.tools.bugDetector.severity
    const resolvedMaxResults = resolveNumber(
      args.maxResults,
      config?.maxResults,
      DEFAULTS.tools.bugDetector.maxResults
    )
    const resolvedDiffOnly = resolveBoolean(
      args.diffOnly,
      config?.diffOnly,
      DEFAULTS.tools.bugDetector.diffOnly
    )
    const resolvedMode = resolveString(
      args.mode,
      config?.mode,
      DEFAULTS.tools.bugDetector.mode
    ) as AnalysisMode
    const resolvedMaxFiles = config?.maxFiles ?? DEFAULTS.tools.bugDetector.maxFiles
    const { scope, patterns: patternCategories, includeSuggestions } = args
    const mode = resolvedMode
    
    try {
      const { cwd } = await import("process")
      const baseDir = context.directory || cwd()
      
      // Filter patterns by category
      const filteredPatterns = bugPatterns.filter(p => 
        patternCategories.includes(p.category)
      )
      
      const allIssues: DetectedBug[] = []
      const packageWarnings = new Set<string>()
      let filesAnalyzed = 0
      const maxFiles = resolvedMaxFiles
      
      // Resolve scope
      const targetPath = resolve(baseDir, scope)
      
      const analyzeFilePath = async (filePath: string) => {
        try {
          const stats = await fs.stat(filePath)
          const cacheKey = getFileCacheKey(filePath, stats.mtimeMs, "bugs")
          const cachedIssues = analysisCache.get(cacheKey)?.value as DetectedBug[] | undefined
          if (cachedIssues && resolvedDiffOnly) {
            return
          }

          const contentKey = getFileCacheKey(filePath, stats.mtimeMs, "content")
          const cachedContent = fileContentCache.get(contentKey)?.value
          const content = cachedContent ?? await fs.readFile(filePath, 'utf-8')
          if (!cachedContent) {
            fileContentCache.set(contentKey, { value: content, mtimeMs: stats.mtimeMs })
          }

          const issues = cachedIssues ?? await analyzeFile(filePath, content, filteredPatterns, resolvedSeverity, mode, packageWarnings)
          if (!cachedIssues) {
            analysisCache.set(cacheKey, { value: issues, mtimeMs: stats.mtimeMs })
          }
          allIssues.push(...issues)
          filesAnalyzed++
        } catch (error) {
          console.warn(`Could not analyze ${filePath}: ${error}`)
        }
      }
      
      const stat = await fs.stat(targetPath).catch(() => null)
      
      if (stat?.isFile()) {
        await analyzeFilePath(targetPath)
      } else if (stat?.isDirectory()) {
        const files = await findFiles(targetPath, "**/*.{js,ts,jsx,tsx,py,go,java,c,cpp}")
        
        await mapWithLimit(files.slice(0, maxFiles), 6, async (file) => {
          if (allIssues.length >= resolvedMaxResults) return
          await analyzeFilePath(file)
        })
      } else {
        // Try as glob pattern - walk current directory
        const files = await findFiles(baseDir, scope)
        
        await mapWithLimit(files.slice(0, maxFiles), 6, async (file) => {
          if (allIssues.length >= resolvedMaxResults) return
          await analyzeFilePath(file)
        })
      }
      
      // Sort by severity
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
      
      // Take top results
      const limitedIssues = allIssues.slice(0, resolvedMaxResults)
      
      // Generate summary
      const confidenceBreakdown = {
        high: allIssues.filter((i) => i.confidence === "high").length,
        medium: allIssues.filter((i) => i.confidence === "medium").length,
        low: allIssues.filter((i) => i.confidence === "low").length,
        heuristic: allIssues.filter((i) => i.confidence === "heuristic").length
      }
      const highConfidenceRatio = allIssues.length === 0
        ? 1
        : (confidenceBreakdown.high + confidenceBreakdown.medium) / allIssues.length
      const overallVerdict = highConfidenceRatio >= 0.7 ? "trusted" : "needs-review"

      const summary = {
        totalIssues: allIssues.length,
        critical: allIssues.filter(i => i.severity === "critical").length,
        high: allIssues.filter(i => i.severity === "high").length,
        medium: allIssues.filter(i => i.severity === "medium").length,
        low: allIssues.filter(i => i.severity === "low").length,
        filesAnalyzed,
        mode,
        confidenceBreakdown,
        overallVerdict,
        highConfidenceRatio: Number(highConfidenceRatio.toFixed(2)),
        packageWarnings: Array.from(packageWarnings),
        categories: patternCategories.reduce((acc, cat) => {
          acc[cat] = allIssues.filter(i => i.category === cat).length
          return acc
        }, {} as Record<string, number>)
      }
      
      context.metadata({
        title: "Bug Detector",
        metadata: {
          totalIssues: summary.totalIssues,
          critical: summary.critical,
          high: summary.high,
          medium: summary.medium,
          low: summary.low,
          filesAnalyzed: summary.filesAnalyzed
        }
      })

      // Build output string
      let output = `## Bug Detection Report\n\n`
      output += `### Summary\n`
      output += `- **Total Issues Found:** ${summary.totalIssues}\n`
      output += `- **Critical:** ${summary.critical} | **High:** ${summary.high} | **Medium:** ${summary.medium} | **Low:** ${summary.low}\n`
      output += `- **Files Analyzed:** ${filesAnalyzed}\n`
      output += `- **Mode:** ${mode} (${resolvedDiffOnly ? "Diff-only" : "Full"})\n`
      output += `- **Confidence:** high=${confidenceBreakdown.high}, medium=${confidenceBreakdown.medium}, low=${confidenceBreakdown.low}, heuristic=${confidenceBreakdown.heuristic}\n`
      output += `- **Overall Verdict:** ${overallVerdict} (high+medium ratio=${summary.highConfidenceRatio})\n\n`

      if (summary.packageWarnings.length > 0) {
        output += `### ⚠️ Precision Warnings\n`
        for (const warning of summary.packageWarnings) {
          output += `- ${warning}\n`
        }
        output += `\n`
      }
      
      if (limitedIssues.length === 0) {
        output += `### ✅ No issues detected!\n`
      } else {
        output += `### Top Issues\n\n`
        
        for (let i = 0; i < Math.min(10, limitedIssues.length); i++) {
          const issue = limitedIssues[i]
          const emoji = issue.severity === 'critical' ? '🚨' : 
                       issue.severity === 'high' ? '⚠️' : 
                       issue.severity === 'medium' ? '⚡' : '💡'
          
          output += `${emoji} **${issue.pattern}**\n`
          output += `   File: \`${relative(baseDir, issue.filePath)}:${issue.line}\`\n`
          output += `   Severity: ${issue.severity.toUpperCase()} | Category: ${issue.category}\n`
          output += `   Confidence: ${issue.confidence.toUpperCase()} | Verification: ${issue.verification}\n`
          output += `   ${issue.description}\n`
          output += `   Evidence: ${issue.evidence}\n`
          
          if (includeSuggestions) {
            output += `   💡 Fix: ${issue.fix}\n`
          }
          output += `\n`
        }
        
        if (allIssues.length > resolvedMaxResults) {
          output += `\n💡 ${allIssues.length - resolvedMaxResults} additional issues not shown (increase maxResults to see more)\n`
        }
      }
      
      return wrapToolOutput({
        summary,
        details: output,
        metadata: {
          tool: "bugDetector",
          issues: summary.totalIssues,
          filesAnalyzed: summary.filesAnalyzed,
          mode,
          overallVerdict
        }
      })
    } catch (error) {
      throw new Error(`Bug detection failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
})
