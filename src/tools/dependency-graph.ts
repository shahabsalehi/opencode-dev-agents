import { tool } from "@opencode-ai/plugin/tool"
import { promises as fs } from "fs"
import { resolve, dirname, join, extname } from "path"
import { cwd } from "process"

/**
 * Dependency Graph Tool
 * 
 * Maps code dependencies, imports, exports, and relationships to:
 * - Understand code structure
 * - Identify relevant files for changes
 * - Detect circular dependencies
 * - Find orphaned code
 */

interface DependencyNode {
  path: string
  imports: ImportInfo[]
  exports: ExportInfo[]
  dependencies: string[] // direct dependencies (imported files)
  dependents: string[] // files that import this file
  depth: number // distance from entry point
  size: number // file size in bytes
}

interface ImportInfo {
  source: string
  type: "default" | "named" | "namespace" | "dynamic" | "require"
  specifiers: string[]
  line: number
}

interface ExportInfo {
  name: string
  type: "default" | "named" | "all"
  line: number
}

// Language-specific import/export patterns
const patterns = {
  javascript: {
    imports: [
      // ES6 imports
      { regex: /import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/g, type: "default" as const },
      { regex: /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"];?/g, type: "named" as const },
      { regex: /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/g, type: "namespace" as const },
      { regex: /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g, type: "dynamic" as const },
      // CommonJS
      { regex: /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, type: "require" as const }
    ],
    exports: [
      { regex: /export\s+default\s+/g, type: "default" as const },
      { regex: /export\s+(?:const|let|var|function|class|interface|type)\s+(\w+)/g, type: "named" as const },
      { regex: /export\s*\{\s*([^}]+)\s*\}/g, type: "named" as const },
      { regex: /export\s+\*\s+from\s+['"]([^'"]+)['"];?/g, type: "all" as const }
    ]
  },
  python: {
    imports: [
      { regex: /import\s+([\w.]+)/g, type: "namespace" as const },
      { regex: /from\s+([\w.]+)\s+import\s+([^\n]+)/g, type: "named" as const }
    ],
    exports: []
  },
  go: {
    imports: [
      { regex: /import\s+\(\s*([^)]+)\s*\)/gs, type: "named" as const },
      { regex: /import\s+['"]([^'"]+)['"]/g, type: "named" as const }
    ],
    exports: [
      { regex: /^func\s+([A-Z]\w*)\s*\(/gm, type: "named" as const },
      { regex: /^type\s+([A-Z]\w*)\s/mg, type: "named" as const },
      { regex: /^var\s+([A-Z]\w*)\s/mg, type: "named" as const },
      { regex: /^const\s+([A-Z]\w*)\s/mg, type: "named" as const }
    ]
  },
  rust: {
    imports: [
      { regex: /use\s+([\w:]+);/g, type: "named" as const },
      { regex: /use\s+([\w:]+)::\{([^}]+)\}/g, type: "named" as const }
    ],
    exports: [
      { regex: /pub\s+(?:fn|struct|enum|trait|type|const|static)\s+(\w+)/g, type: "named" as const }
    ]
  }
}

function detectLanguage(filePath: string): keyof typeof patterns | null {
  const ext = filePath.split('.').pop()?.toLowerCase()
  const langMap: Record<string, keyof typeof patterns> = {
    'js': 'javascript',
    'ts': 'javascript',
    'jsx': 'javascript',
    'tsx': 'javascript',
    'py': 'python',
    'go': 'go',
    'rs': 'rust'
  }
  return ext ? langMap[ext] || null : null
}

function parseImports(content: string, _filePath: string, language: keyof typeof patterns): ImportInfo[] {
  const imports: ImportInfo[] = []
  const langPatterns = patterns[language]
  
  if (!langPatterns) return imports
  
  langPatterns.imports.forEach(({ regex, type }) => {
    let match
    const localRegex = new RegExp(regex.source, regex.flags.replace('g', '') + 'g')
    
    while ((match = localRegex.exec(content)) !== null) {
      const line = content.substring(0, match.index).split('\n').length
      
      if (type === "default") {
        imports.push({
          source: match[2],
          type,
          specifiers: [match[1]],
          line
        })
      } else if (type === "named") {
        const specifiers = match[1]?.split(',').map(s => s.trim()) || []
        imports.push({
          source: match[2] || match[1],
          type,
          specifiers,
          line
        })
      } else if (type === "namespace") {
        imports.push({
          source: match[2] || match[1],
          type,
          specifiers: [match[1]],
          line
        })
      } else if (type === "dynamic" || type === "require") {
        imports.push({
          source: match[1],
          type,
          specifiers: [],
          line
        })
      }
    }
  })
  
  return imports
}

function parseExports(content: string, language: keyof typeof patterns): ExportInfo[] {
  const exports: ExportInfo[] = []
  const langPatterns = patterns[language]
  
  if (!langPatterns) return exports
  
  langPatterns.exports.forEach(({ regex, type }) => {
    let match
    const localRegex = new RegExp(regex.source, regex.flags.replace('g', '') + 'g')
    
    while ((match = localRegex.exec(content)) !== null) {
      const line = content.substring(0, match.index).split('\n').length
      
      if (type === "default") {
        exports.push({ name: "default", type, line })
      } else if (match[1]) {
        const names = match[1].split(',').map(n => n.trim().split(' ')[0])
        names.forEach(name => {
          exports.push({ name, type, line })
        })
      }
    }
  })
  
  return exports
}

async function resolveImportPath(importSource: string, fromFile: string, _directory: string): Promise<string | null> {
  // Skip external packages (node_modules, etc.)
  if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
    return null
  }
  
  const baseDir = dirname(fromFile)
  let resolvedPath = resolve(baseDir, importSource)
  
  // Try different extensions
  const extensions = ['', '.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '/index.js', '/index.ts']
  
  for (const ext of extensions) {
    const fullPath = resolvedPath + ext
    try {
      await fs.access(fullPath)
      return fullPath
    } catch {
      // File doesn't exist, try next extension
    }
  }
  
  return resolvedPath
}

function findCircularDependencies(nodes: Record<string, DependencyNode>): string[][] {
  const cycles: string[][] = []
  const visited = new Set<string>()
  const recursionStack = new Set<string>()
  
  const dfs = (node: string, path: string[]) => {
    if (recursionStack.has(node)) {
      // Found cycle
      const cycleStart = path.indexOf(node)
      cycles.push(path.slice(cycleStart))
      return
    }
    
    if (visited.has(node)) return
    
    visited.add(node)
    recursionStack.add(node)
    path.push(node)
    
    const nodeData = nodes[node]
    if (nodeData) {
      for (const dep of nodeData.dependencies) {
        if (nodes[dep]) {
          dfs(dep, [...path])
        }
      }
    }
    
    recursionStack.delete(node)
  }
  
  for (const node of Object.keys(nodes)) {
    if (!visited.has(node)) {
      dfs(node, [])
    }
  }
  
  return cycles
}

// Find all files recursively
async function findFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const extensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs']
  
  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await walk(fullPath)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (extensions.includes(ext)) {
          files.push(fullPath)
        }
      }
    }
  }
  
  await walk(dir)
  return files
}

export const dependencyGraph = tool({
  description: "Builds a dependency graph for the codebase to understand relationships, find circular dependencies, and identify relevant files for changes. Essential for minimizing context and efficient code navigation.",
  args: {
    entryPoints: tool.schema.array(tool.schema.string()).describe("Entry point files or directories to start graph from"),
    depth: tool.schema.number().min(1).max(10).default(5).describe("Maximum depth to trace dependencies"),
    direction: tool.schema.enum(["in", "out", "both"]).default("both").describe("Direction: 'in' for dependents, 'out' for dependencies, 'both' for both")
  },
  async execute(args) {
    const { entryPoints, depth, direction } = args
    const baseDir = cwd()
    
    try {
      const nodes: Record<string, DependencyNode> = {}
      const queue: Array<{ path: string; depth: number }> = []
      
      // Resolve entry points
      for (const entry of entryPoints) {
        const resolvedPath = resolve(baseDir, entry)
        const stat = await fs.stat(resolvedPath).catch(() => null)
        
        if (stat?.isFile()) {
          queue.push({ path: resolvedPath, depth: 0 })
        } else if (stat?.isDirectory()) {
          // Find files in directory
          const files = await findFiles(resolvedPath)
          files.forEach(file => queue.push({ path: file, depth: 0 }))
        }
      }
      
      // Process queue with BFS
      let processedCount = 0
      const maxFiles = 500 // Prevent infinite processing
      
      while (queue.length > 0 && processedCount < maxFiles) {
        const { path: currentPath, depth: currentDepth } = queue.shift()!
        
        if (nodes[currentPath]) continue
        if (currentDepth > depth) continue
        
        try {
          const content = await fs.readFile(currentPath, 'utf-8')
          const stats = await fs.stat(currentPath)
          const language = detectLanguage(currentPath)
          
          const imports = language ? parseImports(content, currentPath, language) : []
          const exports = language ? parseExports(content, language) : []
          
          // Resolve dependency paths
          const dependencies: string[] = []
          for (const imp of imports) {
            const resolved = await resolveImportPath(imp.source, currentPath, baseDir)
            if (resolved) {
              dependencies.push(resolved)
              
              // Add to queue if within depth limit
              if (currentDepth < depth && direction !== "in") {
                queue.push({ path: resolved, depth: currentDepth + 1 })
              }
            }
          }
          
          nodes[currentPath] = {
            path: currentPath,
            imports,
            exports,
            dependencies: [...new Set(dependencies)],
            dependents: [],
            depth: currentDepth,
            size: stats.size
          }
          
          processedCount++
        } catch (error) {
          console.warn(`Could not process ${currentPath}: ${error}`)
        }
      }
      
      // Build reverse dependencies (dependents)
      if (direction === "in" || direction === "both") {
        for (const [nodePath, node] of Object.entries(nodes)) {
          for (const dep of node.dependencies) {
            if (nodes[dep]) {
              nodes[dep].dependents.push(nodePath)
            }
          }
        }
      }
      
      // Find circular dependencies
      const circularDependencies = findCircularDependencies(nodes)
      
      // Find orphan files (files with no imports or dependents)
      const allFiles = await findFiles(baseDir)
      
      const orphanFiles = allFiles
        .filter(file => !nodes[file])
        .slice(0, 100) // Limit orphans
      
      // Calculate max depth
      const maxDepth = Math.max(...Object.values(nodes).map(n => n.depth))
      
      // Build summary
      const summary = {
        totalFiles: Object.keys(nodes).length,
        totalImports: Object.values(nodes).reduce((sum, n) => sum + n.imports.length, 0),
        totalExports: Object.values(nodes).reduce((sum, n) => sum + n.exports.length, 0),
        circularDependencyCount: circularDependencies.length,
        orphanCount: orphanFiles.length,
        maxDepth,
        averageFileSize: Math.round(
          Object.values(nodes).reduce((sum, n) => sum + n.size, 0) / Object.keys(nodes).length || 0
        )
      }
      
      // Identify key files (most imported)
      const sortedByDependents = Object.values(nodes)
        .sort((a, b) => b.dependents.length - a.dependents.length)
        .slice(0, 10)
        .map(n => ({
          path: n.path,
          dependents: n.dependents.length,
          exports: n.exports.length
        }))
      
      // Build output string
      let output = `## Dependency Graph Report\n\n`
      output += `### Summary\n`
      output += `- **Total Files Analyzed:** ${summary.totalFiles}\n`
      output += `- **Total Imports:** ${summary.totalImports}\n`
      output += `- **Total Exports:** ${summary.totalExports}\n`
      output += `- **Circular Dependencies:** ${summary.circularDependencyCount}\n`
      output += `- **Orphan Files:** ${summary.orphanCount}\n`
      output += `- **Max Depth:** ${maxDepth}\n`
      output += `- **Average File Size:** ${summary.averageFileSize} bytes\n\n`
      
      if (circularDependencies.length > 0) {
        output += `### ⚠️ Circular Dependencies\n\n`
        circularDependencies.slice(0, 5).forEach((cycle, i) => {
          output += `${i + 1}. ${cycle.join(' → ')}\n`
        })
        if (circularDependencies.length > 5) {
          output += `\n... and ${circularDependencies.length - 5} more\n`
        }
        output += `\n`
      }
      
      if (sortedByDependents.length > 0) {
        output += `### Key Files (Most Referenced)\n\n`
        sortedByDependents.forEach((file, i) => {
          const relativePath = file.path.replace(baseDir, '').replace(/^\//, '')
          output += `${i + 1}. \`${relativePath}\` - ${file.dependents} dependents, ${file.exports} exports\n`
        })
        output += `\n`
      }
      
      if (orphanFiles.length > 0) {
        output += `### ℹ️ Potentially Unused Files (${orphanFiles.length})\n\n`
        orphanFiles.slice(0, 10).forEach(file => {
          const relativePath = file.replace(baseDir, '').replace(/^\//, '')
          output += `- \`${relativePath}\`\n`
        })
        if (orphanFiles.length > 10) {
          output += `- ... and ${orphanFiles.length - 10} more\n`
        }
        output += `\n`
      }
      
      // Recommendations
      output += `### Recommendations\n\n`
      if (circularDependencies.length > 0) {
        output += `- ⚠️ Resolve ${circularDependencies.length} circular dependencies\n`
      }
      if (orphanFiles.length > 10) {
        output += `- ℹ️ Review ${orphanFiles.length} potentially unused files\n`
      }
      if (maxDepth > 5) {
        output += `- ⚠️ Deep dependency chain (${maxDepth} levels) - consider flattening architecture\n`
      }
      if (summary.totalFiles > 200) {
        output += `- 💡 Large codebase detected - consider modularization\n`
      }
      
      return output
    } catch (error) {
      throw new Error(`Dependency graph generation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
})
