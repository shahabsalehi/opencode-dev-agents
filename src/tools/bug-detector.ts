import { tool } from "@opencode-ai/plugin/tool"
import { promises as fs } from "fs"
import { resolve, relative } from "path"

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
  minSeverity: string
): Promise<DetectedBug[]> {
  const detected: DetectedBug[] = []
  const lines = content.split('\n')
  const language = detectLanguage(filePath)
  
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
      
      detected.push({
        pattern: pattern.id,
        filePath,
        line: lineNum,
        column,
        severity: pattern.severity,
        category: pattern.category,
        description: pattern.description,
        fix: pattern.fix,
        snippet: snippet.trim()
      })
    }
  }
  
  return detected
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
    patterns: tool.schema.array(
      tool.schema.enum(["security", "logic", "performance", "concurrency", "resource", "api"])
    ).default(["security", "logic", "concurrency"]).describe("Categories of bugs to detect"),
    severity: tool.schema.enum(["all", "low", "medium", "high", "critical"]).default("all").describe("Minimum severity level to report"),
    maxResults: tool.schema.number().min(1).max(500).default(100).describe("Maximum number of issues to report"),
    includeSuggestions: tool.schema.boolean().default(true).describe("Include fix suggestions for each issue")
  },
  async execute(args) {
    const { scope, patterns: patternCategories, severity, maxResults, includeSuggestions } = args
    
    try {
      const { cwd } = await import("process")
      const baseDir = cwd()
      
      // Filter patterns by category
      const filteredPatterns = bugPatterns.filter(p => 
        patternCategories.includes(p.category)
      )
      
      const allIssues: DetectedBug[] = []
      let filesAnalyzed = 0
      const maxFiles = 200
      
      // Resolve scope
      const targetPath = resolve(baseDir, scope)
      
      const analyzeFilePath = async (filePath: string) => {
        try {
          const content = await fs.readFile(filePath, 'utf-8')
          const issues = await analyzeFile(filePath, content, filteredPatterns, severity)
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
        
        for (const file of files.slice(0, maxFiles)) {
          if (allIssues.length >= maxResults) break
          await analyzeFilePath(file)
        }
      } else {
        // Try as glob pattern - walk current directory
        const files = await findFiles(baseDir, scope)
        
        for (const file of files.slice(0, maxFiles)) {
          if (allIssues.length >= maxResults) break
          await analyzeFilePath(file)
        }
      }
      
      // Sort by severity
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
      
      // Take top results
      const limitedIssues = allIssues.slice(0, maxResults)
      
      // Generate summary
      const summary = {
        totalIssues: allIssues.length,
        critical: allIssues.filter(i => i.severity === "critical").length,
        high: allIssues.filter(i => i.severity === "high").length,
        medium: allIssues.filter(i => i.severity === "medium").length,
        low: allIssues.filter(i => i.severity === "low").length,
        filesAnalyzed,
        categories: patternCategories.reduce((acc, cat) => {
          acc[cat] = allIssues.filter(i => i.category === cat).length
          return acc
        }, {} as Record<string, number>)
      }
      
      // Build output string
      let output = `## Bug Detection Report\n\n`
      output += `### Summary\n`
      output += `- **Total Issues Found:** ${summary.totalIssues}\n`
      output += `- **Critical:** ${summary.critical} | **High:** ${summary.high} | **Medium:** ${summary.medium} | **Low:** ${summary.low}\n`
      output += `- **Files Analyzed:** ${filesAnalyzed}\n\n`
      
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
          output += `   ${issue.description}\n`
          
          if (includeSuggestions) {
            output += `   💡 Fix: ${issue.fix}\n`
          }
          output += `\n`
        }
        
        if (allIssues.length > maxResults) {
          output += `\n💡 ${allIssues.length - maxResults} additional issues not shown (increase maxResults to see more)\n`
        }
      }
      
      return output
    } catch (error) {
      throw new Error(`Bug detection failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
})
