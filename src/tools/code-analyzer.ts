import { tool } from "@opencode-ai/plugin/tool"
import { promises as fs } from "fs"
import { resolve, join, extname } from "path"
import { cwd } from "process"

/**
 * Code Analyzer Tool
 * 
 * Performs static analysis on code to identify:
 * - Complexity metrics (cyclomatic complexity, cognitive complexity)
 * - Code quality issues
 * - Security vulnerabilities
 * - Performance anti-patterns
 * - Maintainability scores
 */

interface ComplexityMetrics {
  cyclomaticComplexity: number
  cognitiveComplexity: number
  linesOfCode: number
  linesOfComments: number
  functionCount: number
  averageFunctionLength: number
}

interface QualityIssue {
  type: "security" | "performance" | "maintainability" | "style"
  severity: "low" | "medium" | "high" | "critical"
  message: string
  line?: number
  column?: number
  rule?: string
}

interface AnalysisResult {
  filePath: string
  metrics: ComplexityMetrics
  issues: QualityIssue[]
  maintainabilityIndex: number
  grade: "A" | "B" | "C" | "D" | "F"
  recommendations: string[]
}

// Security patterns to detect
const securityPatterns = [
  { pattern: /eval\s*\(/i, message: "Use of eval() can lead to code injection", severity: "critical" as const },
  { pattern: /document\.write\s*\(/i, message: "document.write can lead to XSS vulnerabilities", severity: "high" as const },
  { pattern: /innerHTML\s*=/i, message: "innerHTML assignment can lead to XSS", severity: "high" as const },
  { pattern: /password\s*[=:]\s*["'][^"']+["']/i, message: "Hardcoded password detected", severity: "critical" as const },
  { pattern: /api[_-]?key\s*[=:]\s*["'][^"']+["']/i, message: "Hardcoded API key detected", severity: "critical" as const },
  { pattern: /secret\s*[=:]\s*["'][^"']+["']/i, message: "Hardcoded secret detected", severity: "critical" as const },
  { pattern: /console\.log\s*\(/i, message: "Debug console statement should be removed", severity: "low" as const },
  { pattern: /debugger;/i, message: "Debugger statement should be removed", severity: "medium" as const }
]

// Performance anti-patterns
const performancePatterns = [
  { pattern: /for\s*\(\s*var\s+i\s*=\s*0;\s*i\s*<\s*(\w+)\.length/, message: "Inefficient loop - caching array length improves performance", severity: "low" as const },
  { pattern: /new\s+Array\s*\(\s*\d+\s*\)/, message: "Consider using array literal [] instead of new Array()", severity: "low" as const },
  { pattern: /\.indexOf\s*\(\s*["'][^"']+["']\s*\)\s*!==?\s*-1/, message: "Consider using includes() for readability", severity: "low" as const }
]

// Maintainability patterns
const maintainabilityPatterns = [
  { pattern: /function\s*\w*\s*\([^)]*\)\s*\{[^{}]{300,}\}/s, message: "Function too long - consider breaking into smaller functions", severity: "medium" as const },
  { pattern: /if\s*\([^)]*\)\s*\{[^}]*if\s*\(/s, message: "Deep nesting detected - consider early returns or extraction", severity: "medium" as const },
  { pattern: /TODO|FIXME|XXX|HACK/i, message: "Technical debt marker found", severity: "low" as const },
  { pattern: /var\s+/g, message: "Use let or const instead of var for better scoping", severity: "low" as const }
]

function calculateCyclomaticComplexity(content: string): number {
  const branches = [
    /\bif\b/g,
    /\belse\s+if\b/g,
    /\bswitch\b/g,
    /\bcase\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bdo\b/g,
    /\?\s*[^:]+\s*:/g, // ternary operators
    /\|\|/g,
    /&&/g,
    /\bcatch\b/g
  ]
  
  let complexity = 1 // Base complexity
  branches.forEach(pattern => {
    const matches = content.match(pattern)
    if (matches) {
      complexity += matches.length
    }
  })
  
  return complexity
}

function calculateCognitiveComplexity(content: string): number {
  const nestingPatterns = [
    { pattern: /\{[^{}]*\{/g, weight: 1 },
    { pattern: /\bif\b|\bfor\b|\bwhile\b|\bswitch\b/g, weight: 1 },
    { pattern: /\?\s*[^:]+\s*:/g, weight: 1 } // ternary
  ]
  
  let complexity = 0
  nestingPatterns.forEach(({ pattern, weight }) => {
    const matches = content.match(pattern)
    if (matches) {
      complexity += matches.length * weight
    }
  })
  
  return complexity
}

function calculateMaintainabilityIndex(
  halsteadVolume: number, 
  cyclomaticComplexity: number, 
  linesOfCode: number,
  commentRatio: number
): number {
  // Simplified maintainability index calculation
  // Range: 0-100, higher is better
  const mi = Math.max(0, 
    171 - 
    5.2 * Math.log(halsteadVolume || 1) - 
    0.23 * cyclomaticComplexity - 
    16.2 * Math.log(linesOfCode || 1) + 
    50 * Math.sin(Math.sqrt(2.46 * commentRatio))
  )
  
  return Math.min(100, Math.max(0, mi))
}

function assignGrade(maintainabilityIndex: number, complexity: number): AnalysisResult["grade"] {
  if (maintainabilityIndex >= 85 && complexity <= 10) return "A"
  if (maintainabilityIndex >= 70 && complexity <= 20) return "B"
  if (maintainabilityIndex >= 50 && complexity <= 30) return "C"
  if (maintainabilityIndex >= 25) return "D"
  return "F"
}

async function analyzeFile(filePath: string, content: string): Promise<AnalysisResult> {
  const lines = content.split('\n')
  const linesOfCode = lines.filter(line => line.trim().length > 0).length
  const linesOfComments = lines.filter(line => 
    line.trim().startsWith('//') || 
    line.trim().startsWith('*') || 
    line.trim().startsWith('/*')
  ).length
  
  const commentRatio = linesOfCode > 0 ? linesOfComments / linesOfCode : 0
  
  // Count functions
  const functionMatches = content.match(/\bfunction\s+\w+\s*\(|\basync\s+function\s*\(|\bconst\s+\w+\s*=\s*(async\s*)?\(|\b\w+\s*:\s*(async\s*)?\(/g)
  const functionCount = functionMatches ? functionMatches.length : 0
  const averageFunctionLength = functionCount > 0 ? Math.round(linesOfCode / functionCount) : 0
  
  const cyclomaticComplexity = calculateCyclomaticComplexity(content)
  const cognitiveComplexity = calculateCognitiveComplexity(content)
  
  // Detect issues
  const issues: QualityIssue[] = []
  
  // Security issues
  securityPatterns.forEach(({ pattern, message, severity }) => {
    const matches = content.match(pattern)
    if (matches) {
      matches.forEach(() => {
        issues.push({ type: "security", severity, message, rule: "security" })
      })
    }
  })
  
  // Performance issues
  performancePatterns.forEach(({ pattern, message, severity }) => {
    const matches = content.match(pattern)
    if (matches) {
      matches.forEach(() => {
        issues.push({ type: "performance", severity, message, rule: "performance" })
      })
    }
  })
  
  // Maintainability issues
  maintainabilityPatterns.forEach(({ pattern, message, severity }) => {
    const matches = content.match(pattern)
    if (matches) {
      matches.forEach(() => {
        issues.push({ type: "maintainability", severity, message, rule: "maintainability" })
      })
    }
  })
  
  // Calculate maintainability index (simplified)
  const halsteadVolume = linesOfCode * Math.log2(functionCount + 1 || 2)
  const maintainabilityIndex = calculateMaintainabilityIndex(
    halsteadVolume,
    cyclomaticComplexity,
    linesOfCode,
    commentRatio
  )
  
  const grade = assignGrade(maintainabilityIndex, cyclomaticComplexity)
  
  // Generate recommendations
  const recommendations: string[] = []
  if (cyclomaticComplexity > 10) {
    recommendations.push("Reduce cyclomatic complexity by breaking complex functions into smaller ones")
  }
  if (cognitiveComplexity > 15) {
    recommendations.push("Simplify cognitive complexity by reducing nested conditions")
  }
  if (commentRatio < 0.1) {
    recommendations.push("Add more inline comments to improve code documentation")
  }
  if (averageFunctionLength > 30) {
    recommendations.push("Break long functions into smaller, more focused functions")
  }
  if (functionCount > 0 && functionCount < 2 && linesOfCode > 100) {
    recommendations.push("Consider modularizing the code into separate files")
  }
  
  return {
    filePath,
    metrics: {
      cyclomaticComplexity,
      cognitiveComplexity,
      linesOfCode,
      linesOfComments,
      functionCount,
      averageFunctionLength
    },
    issues,
    maintainabilityIndex: Math.round(maintainabilityIndex),
    grade,
    recommendations
  }
}

export const codeAnalyzer = tool({
  description: "Analyzes code for complexity, quality, security, and performance issues. Returns metrics, detected issues, and recommendations.",
  args: {
    target: tool.schema.string().describe("File or directory path to analyze"),
    threshold: tool.schema.number().min(0).max(100).default(70).describe("Quality threshold (0-100). Files below this score are flagged"),
    maxFiles: tool.schema.number().min(1).max(100).default(50).describe("Maximum number of files to analyze (for directories)")
  },
  async execute(args) {
    const { target, threshold, maxFiles } = args
    const baseDir = cwd()
    
    try {
      const targetPath = resolve(baseDir, target)
      
      const results: AnalysisResult[] = []
      let filesAnalyzed = 0
      
      const analyzeTarget = async (filePath: string) => {
        try {
          const content = await fs.readFile(filePath, 'utf-8')
          const result = await analyzeFile(filePath, content)
          results.push(result)
          filesAnalyzed++
        } catch (error) {
          console.warn(`Could not analyze ${filePath}: ${error}`)
        }
      }
      
      const stat = await fs.stat(targetPath)
      
      if (stat.isFile()) {
        await analyzeTarget(targetPath)
      } else if (stat.isDirectory()) {
        // Read directory recursively
        const readDir = async (dir: string) => {
          if (filesAnalyzed >= maxFiles) return
          
          const entries = await fs.readdir(dir, { withFileTypes: true })
          
          for (const entry of entries) {
            if (filesAnalyzed >= maxFiles) break
            
            const fullPath = join(dir, entry.name)
            
            if (entry.isDirectory()) {
              // Skip common non-code directories
              if (!['node_modules', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) {
                await readDir(fullPath)
              }
            } else if (entry.isFile()) {
              // Analyze code files
              const ext = extname(entry.name).toLowerCase()
              if (['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.java', '.rb', '.php'].includes(ext)) {
                await analyzeTarget(fullPath)
              }
            }
          }
        }
        
        await readDir(targetPath)
      }
      
      // Calculate summary statistics
      const summary = {
        totalFiles: results.length,
        averageComplexity: results.length > 0 
          ? Math.round(results.reduce((sum, r) => sum + r.metrics.cyclomaticComplexity, 0) / results.length)
          : 0,
        totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0),
        securityIssues: results.reduce((sum, r) => sum + r.issues.filter(i => i.type === "security").length, 0),
        performanceIssues: results.reduce((sum, r) => sum + r.issues.filter(i => i.type === "performance").length, 0),
        maintainabilityIssues: results.reduce((sum, r) => sum + r.issues.filter(i => i.type === "maintainability").length, 0),
        averageMaintainability: results.length > 0
          ? Math.round(results.reduce((sum, r) => sum + r.maintainabilityIndex, 0) / results.length)
          : 0,
        belowThreshold: results.filter(r => r.maintainabilityIndex < threshold).length,
        gradeDistribution: {
          A: results.filter(r => r.grade === "A").length,
          B: results.filter(r => r.grade === "B").length,
          C: results.filter(r => r.grade === "C").length,
          D: results.filter(r => r.grade === "D").length,
          F: results.filter(r => r.grade === "F").length
        }
      }
      
      // Build output string
      let output = `## Code Analysis Report\n\n`
      output += `### Summary\n`
      output += `- **Files Analyzed:** ${summary.totalFiles}\n`
      output += `- **Average Complexity:** ${summary.averageComplexity}\n`
      output += `- **Average Maintainability:** ${summary.averageMaintainability}/100\n`
      output += `- **Total Issues:** ${summary.totalIssues}\n`
      output += `  - Security: ${summary.securityIssues}\n`
      output += `  - Performance: ${summary.performanceIssues}\n`
      output += `  - Maintainability: ${summary.maintainabilityIssues}\n`
      output += `- **Below Threshold:** ${summary.belowThreshold} files\n`
      output += `- **Grade Distribution:** A:${summary.gradeDistribution.A} B:${summary.gradeDistribution.B} C:${summary.gradeDistribution.C} D:${summary.gradeDistribution.D} F:${summary.gradeDistribution.F}\n\n`
      
      if (results.length === 0) {
        output += `### No files found to analyze\n`
      } else {
        output += `### File Details (sorted by maintainability)\n\n`
        
        const sortedResults = results.sort((a, b) => a.maintainabilityIndex - b.maintainabilityIndex)
        
        for (const result of sortedResults) {
          const relativePath = result.filePath.replace(baseDir, '').replace(/^\//, '')
          const status = result.maintainabilityIndex < threshold ? '⚠️' : '✅'
          
          output += `${status} **${relativePath}**\n`
          output += `   Grade: ${result.grade} | Maintainability: ${result.maintainabilityIndex}/100\n`
          output += `   Complexity: ${result.metrics.cyclomaticComplexity} | Functions: ${result.metrics.functionCount} | LOC: ${result.metrics.linesOfCode}\n`
          
          if (result.issues.length > 0) {
            output += `   Issues: ${result.issues.length}\n`
            for (const issue of result.issues.slice(0, 3)) {
              const emoji = issue.severity === 'critical' ? '🚨' : issue.severity === 'high' ? '⚠️' : '💡'
              output += `   ${emoji} ${issue.message}\n`
            }
            if (result.issues.length > 3) {
              output += `   ... and ${result.issues.length - 3} more\n`
            }
          }
          
          output += `\n`
        }
      }
      
      return output
    } catch (error) {
      throw new Error(`Code analysis failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
})
