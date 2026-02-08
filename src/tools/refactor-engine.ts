import { tool } from "@opencode-ai/plugin/tool"
import { promises as fs } from "fs"
import { resolve, relative, extname } from "path"
import { cwd } from "process"

/**
 * Refactor Engine Tool
 * 
 * Performs safe code transformations:
 * - Extract functions/methods
 * - Rename symbols
 * - Modernize syntax
 * - Remove dead code
 * - Apply coding standards
 */

interface CodeChange {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
  original: string
  replacement: string
  description: string
}

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

interface TransformationRule {
  name: string
  description: string
  appliesTo: string[] // file extensions
  transform: (content: string, options: any) => CodeChange[]
  validate?: (content: string, changes: CodeChange[]) => ValidationResult
}

// Built-in transformation rules
const transformationRules: Record<string, TransformationRule> = {
  'modernize-syntax': {
    name: 'Modernize Syntax',
    description: 'Convert older JavaScript syntax to modern equivalents',
    appliesTo: ['.js', '.ts', '.jsx', '.tsx'],
    transform: (content, _options) => {
      const changes: CodeChange[] = []
      const lines = content.split('\n')
      
      // var to let/const
      const varRegex = /\bvar\b/g
      let varToLetMatch: RegExpExecArray | null
      while ((varToLetMatch = varRegex.exec(content)) !== null) {
        const index = varToLetMatch.index
        const lineNum = content.substring(0, index).split('\n').length
        const line = lines[lineNum - 1]
        const column = index - content.lastIndexOf('\n', index - 1)

        // Simple heuristic: if value is reassigned later, use let
        const varName = line.slice(column + 4).match(/\s*(\w+)/)?.[1]
        const isReassigned = varName && new RegExp(`\\b${varName}\\s*=`).test(content.slice(index + line.length))
        const replacement = isReassigned ? 'let' : 'const'

        changes.push({
          startLine: lineNum,
          startColumn: column + 1,
          endLine: lineNum,
          endColumn: column + 4,
          original: 'var',
          replacement,
          description: `Change 'var' to '${replacement}' for better scoping`
        })
      }

      // function to arrow function for callbacks
      const callbackRegex = /function\s*\(([^)]*)\)\s*\{/g
      let callbackMatch: RegExpExecArray | null
      while ((callbackMatch = callbackRegex.exec(content)) !== null) {
        const index = callbackMatch.index
        const lineNum = content.substring(0, index).split('\n').length
        const column = index - content.lastIndexOf('\n', index - 1)

        changes.push({
          startLine: lineNum,
          startColumn: column + 1,
          endLine: lineNum,
          endColumn: column + callbackMatch[0].length,
          original: callbackMatch[0],
          replacement: `(${callbackMatch[1]}) => {`,
          description: 'Convert anonymous function to arrow function'
        })
      }
      
        // Template literals for string concatenation
      const concatRegex = /["']([^"']+)["']\s*\+\s*(\w+)/g
      let concatMatch
      while ((concatMatch = concatRegex.exec(content)) !== null) {
        // Only if it looks like a pattern that could use template literal
        if (content.slice(concatMatch.index + concatMatch[0].length).match(/^\s*(\+\s*["']|$)/)) {
          const concatIndex = concatMatch.index
          const concatLineNum = content.substring(0, concatIndex).split('\n').length
          const concatColumn = concatIndex - content.lastIndexOf('\n', concatIndex - 1)
          
          changes.push({
            startLine: concatLineNum,
            startColumn: concatColumn + 1,
            endLine: concatLineNum,
            endColumn: concatColumn + concatMatch[0].length,
            original: concatMatch[0],
            replacement: `\`${concatMatch[1]}\${${concatMatch[2]}}\``,
            description: 'Convert string concatenation to template literal'
          })
        }
      }
      
      return changes
    }
  },
  
  'remove-dead-code': {
    name: 'Remove Dead Code',
    description: 'Remove unused variables, functions, and imports',
    appliesTo: ['.js', '.ts', '.jsx', '.tsx', '.py'],
    transform: (content, _options) => {
      const changes: CodeChange[] = []
      const lines = content.split('\n')
      
      // Find unused imports (simplified - real implementation would need AST)
      const importRegex = /import\s+\{\s*([^}]+)\s*\}\s+from/g
      let importMatch: RegExpExecArray | null
      while ((importMatch = importRegex.exec(content)) !== null) {
        const imports = importMatch[1].split(',').map(s => s.trim())
        const unused = imports.filter(imp => {
          const name = imp.split(' ')[0]
          // Check if used elsewhere (excluding the import statement itself)
          const afterImport = content.slice(importMatch!.index + importMatch![0].length)
          const usageRegex = new RegExp(`\\b${name}\\b`, 'g')
          return !usageRegex.test(afterImport)
        })
        
        if (unused.length > 0 && unused.length === imports.length) {
          // Remove entire import
          const lineNum = content.substring(0, importMatch.index).split('\n').length
          const line = lines[lineNum - 1]
          
          changes.push({
            startLine: lineNum,
            startColumn: 1,
            endLine: lineNum,
            endColumn: line.length + 1,
            original: line,
            replacement: '',
            description: 'Remove unused import'
          })
        }
      }
      
      // Find unused variables
      const varRegex = /(?:const|let|var)\s+(\w+)/g
      let varMatch: RegExpExecArray | null
      while ((varMatch = varRegex.exec(content)) !== null) {
        const varName = varMatch[1]
        const declarationIndex = varMatch.index
        
        // Check usage after declaration (excluding declaration itself)
        const afterDeclaration = content.slice(declarationIndex + varMatch[0].length)
        const usageRegex = new RegExp(`\\b${varName}\\b(?!\\s*=)`, 'g')
        
        if (!usageRegex.test(afterDeclaration)) {
          const lineNum = content.substring(0, declarationIndex).split('\n').length
          const line = lines[lineNum - 1]
          
          // Only remove if it's a simple declaration
          if (line.match(new RegExp(`^\\s*(?:const|let|var)\\s+${varName}\\s*=`))) {
            changes.push({
              startLine: lineNum,
              startColumn: 1,
              endLine: lineNum,
              endColumn: line.length + 1,
              original: line,
              replacement: '',
              description: `Remove unused variable '${varName}'`
            })
          }
        }
      }
      
      return changes
    }
  },
  
  'extract-function': {
    name: 'Extract Function',
    description: 'Extract selected code into a new function',
    appliesTo: ['.js', '.ts', '.jsx', '.tsx', '.py', '.go'],
    transform: (content, options) => {
      const { startLine, endLine, functionName, parameters } = options
      const changes: CodeChange[] = []
      const lines = content.split('\n')
      
      if (startLine < 1 || endLine > lines.length || startLine > endLine) {
        return changes
      }
      
      // Extract the code to be moved
      const codeToExtract = lines.slice(startLine - 1, endLine).join('\n')
      
      // Determine indentation
      const firstLine = lines[startLine - 1]
      const indent = firstLine.match(/^(\s*)/)?.[1] || ''
      const innerIndent = indent + '  '
      
      // Create the new function
      const paramList = parameters?.join(', ') || ''
      const newFunction = `\n${indent}function ${functionName}(${paramList}) {\n${innerIndent}${codeToExtract.trim()}\n${indent}}\n`
      
      // Find insertion point (after the original function or at end)
      let insertLine = lines.length
      for (let i = startLine - 1; i >= 0; i--) {
        if (lines[i].match(/^\s*function\s+\w+/)) {
          // Find end of this function
          let braceCount = 0
          for (let j = i; j < lines.length; j++) {
            braceCount += (lines[j].match(/\{/g) || []).length
            braceCount -= (lines[j].match(/\}/g) || []).length
            if (braceCount === 0) {
              insertLine = j + 1
              break
            }
          }
          break
        }
      }
      
      // Change 1: Replace extracted code with function call
      changes.push({
        startLine,
        startColumn: 1,
        endLine,
        endColumn: lines[endLine - 1].length + 1,
        original: codeToExtract,
        replacement: `${indent}return ${functionName}(${paramList});`,
        description: 'Replace extracted code with function call'
      })
      
      // Change 2: Insert new function
      changes.push({
        startLine: insertLine,
        startColumn: 1,
        endLine: insertLine,
        endColumn: 1,
        original: '',
        replacement: newFunction,
        description: `Insert new function '${functionName}'`
      })
      
      return changes
    }
  },
  
  'rename-symbol': {
    name: 'Rename Symbol',
    description: 'Rename a variable, function, or class throughout the codebase',
    appliesTo: ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.java'],
    transform: (content, options) => {
      const { oldName, newName } = options
      const changes: CodeChange[] = []
      
      if (!oldName || !newName || oldName === newName) {
        return changes
      }
      
      // Create regex that matches the symbol name as a whole word
      const symbolRegex = new RegExp(`\\b${oldName}\\b`, 'g')
      let symbolMatch: RegExpExecArray | null

      while ((symbolMatch = symbolRegex.exec(content)) !== null) {
        const index = symbolMatch.index
        const lineNum = content.substring(0, index).split('\n').length
        const column = index - content.lastIndexOf('\n', index - 1)

        changes.push({
          startLine: lineNum,
          startColumn: column + 1,
          endLine: lineNum,
          endColumn: column + oldName.length + 1,
          original: oldName,
          replacement: newName,
          description: `Rename '${oldName}' to '${newName}'`
        })
      }

      return changes
    }
  },

  'optimize-imports': {
    name: 'Optimize Imports',
    description: 'Sort and organize imports, remove duplicates',
    appliesTo: ['.js', '.ts', '.jsx', '.tsx', '.py'],
    transform: (content, _options) => {
      const changes: CodeChange[] = []
      const lines = content.split('\n')

      // Find all import statements
      const imports: Array<{ line: number; text: string; source: string; isExternal: boolean }> = []
      const importRegex = /import\s+(?:\{[^}]+\}|\w+|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"];?/

      for (let i = 0; i < lines.length; i++) {
        const lineMatch = lines[i].match(importRegex)
        if (lineMatch) {
          imports.push({
            line: i + 1,
            text: lines[i],
            source: lineMatch[1],
            isExternal: !lineMatch[1].startsWith('.')
          })
        }
      }
      
      if (imports.length === 0) return changes
      
      // Sort imports: external first, then internal, alphabetically
      imports.sort((a, b) => {
        if (a.isExternal && !b.isExternal) return -1
        if (!a.isExternal && b.isExternal) return 1
        return a.source.localeCompare(b.source)
      })
      
      // Check if already sorted
      const isSorted = imports.every((imp, i) => 
        i === 0 || imp.line > imports[i - 1].line
      )
      
      if (isSorted) return changes
      
      // Generate sorted imports
      const firstImportLine = imports[0].line
      const lastImportLine = imports[imports.length - 1].line
      
      let sortedImportText = ''
      let lastWasExternal = true
      
      for (const imp of imports) {
        if (imp.isExternal !== lastWasExternal) {
          sortedImportText += '\n'
        }
        sortedImportText += imp.text + '\n'
        lastWasExternal = imp.isExternal
      }
      
      changes.push({
        startLine: firstImportLine,
        startColumn: 1,
        endLine: lastImportLine,
        endColumn: lines[lastImportLine - 1].length + 1,
        original: lines.slice(firstImportLine - 1, lastImportLine).join('\n'),
        replacement: sortedImportText.trim(),
        description: 'Sort and organize imports'
      })
      
      return changes
    }
  },
  
  'add-types': {
    name: 'Add TypeScript Types',
    description: 'Add type annotations to JavaScript code',
    appliesTo: ['.ts', '.tsx'],
    transform: (content, _options) => {
      const changes: CodeChange[] = []
      
      // Find function parameters without types
      const functionRegex = /function\s+(\w+)\s*\(([^)]*)\)/g
      let funcMatch: RegExpExecArray | null

      while ((funcMatch = functionRegex.exec(content)) !== null) {
        const funcName = funcMatch[1]
        const params = funcMatch[2]

        // Skip if already has type annotations
        if (params.includes(':')) continue

        const index = funcMatch.index
        const lineNum = content.substring(0, index).split('\n').length
        const column = index - content.lastIndexOf('\n', index - 1)

        // Simple heuristic: add 'any' type (in real implementation, infer from usage)
        const typedParams = params.split(',').map(p => {
          const paramName = p.trim()
          if (!paramName) return ''
          return `${paramName}: any`
        }).join(', ')

        changes.push({
          startLine: lineNum,
          startColumn: column + funcMatch[0].indexOf('(') + 1,
          endLine: lineNum,
          endColumn: column + funcMatch[0].indexOf(')') + 1,
          original: params,
          replacement: typedParams,
          description: `Add type annotations to function '${funcName}'`
        })
      }
      
      return changes
    }
  }
}

function applyChanges(content: string, changes: CodeChange[]): string {
  // Sort changes by position in reverse order (so earlier changes don't affect later positions)
  const sortedChanges = [...changes].sort((a, b) => {
    if (a.startLine !== b.startLine) return b.startLine - a.startLine
    return b.startColumn - a.startColumn
  })
  
  let result = content
  const lines = result.split('\n')
  
  for (const change of sortedChanges) {
    // Find the position in the string
    let charIndex = 0
    for (let i = 0; i < change.startLine - 1; i++) {
      charIndex += lines[i].length + 1 // +1 for newline
    }
    charIndex += change.startColumn - 1
    
    // Calculate end position
    let endCharIndex = charIndex
    for (let i = change.startLine - 1; i < change.endLine - 1; i++) {
      if (i === change.startLine - 1) {
        endCharIndex = charIndex + (lines[i].length - change.startColumn + 1)
      } else {
        endCharIndex += lines[i].length + 1
      }
    }
    if (change.endLine > change.startLine) {
      endCharIndex += change.endColumn - 1
    } else {
      endCharIndex = charIndex + (change.endColumn - change.startColumn)
    }
    
    // Apply change
    result = result.substring(0, charIndex) + change.replacement + result.substring(endCharIndex)
  }
  
  return result
}

function validateChanges(original: string, modified: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  
  // Check for syntax errors (basic checks)
  const openBraces = (modified.match(/\{/g) || []).length
  const closeBraces = (modified.match(/\}/g) || []).length
  if (openBraces !== closeBraces) {
    errors.push('Brace mismatch detected')
  }
  
  const openParens = (modified.match(/\(/g) || []).length
  const closeParens = (modified.match(/\)/g) || []).length
  if (openParens !== closeParens) {
    errors.push('Parenthesis mismatch detected')
  }
  
  // Check for common issues
  if (modified.includes(';;')) {
    warnings.push('Double semicolons found')
  }
  
  if (modified.match(/\{\s*\}/) && !original.match(/\{\s*\}/)) {
    warnings.push('Empty blocks created')
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

export const refactorEngine = tool({
  description: "Performs safe code refactoring transformations. Supports modernizing syntax, extracting functions, renaming symbols, removing dead code, and optimizing imports with validation.",
  args: {
    files: tool.schema.array(tool.schema.string()).describe("Files to refactor"),
    transformation: tool.schema.enum([
      "modernize-syntax", "remove-dead-code", "extract-function", 
      "rename-symbol", "optimize-imports", "add-types"
    ]).describe("Type of refactoring to apply"),
    options: tool.schema.object({
      startLine: tool.schema.number().optional().describe("Start line for extract-function"),
      endLine: tool.schema.number().optional().describe("End line for extract-function"),
      functionName: tool.schema.string().optional().describe("Name for extracted function"),
      parameters: tool.schema.array(tool.schema.string()).optional().describe("Parameters for extracted function"),
      oldName: tool.schema.string().optional().describe("Old name for rename-symbol"),
      newName: tool.schema.string().optional().describe("New name for rename-symbol"),
      scope: tool.schema.enum(["file", "project"]).optional().describe("Scope for rename-symbol")
    }).optional().describe("Transformation-specific options"),
    preview: tool.schema.boolean().default(true).describe("Show changes without applying them"),
    dryRun: tool.schema.boolean().default(true).describe("Validate changes without writing to disk")
  },
  async execute(args) {
    const { files, transformation, options = {}, preview, dryRun } = args
    const baseDir = cwd()
    
    try {
      const rule = transformationRules[transformation]
      if (!rule) {
        throw new Error(`Unknown transformation: ${transformation}`)
      }
      
      const results: Array<{
        file: string
        changes: CodeChange[]
        validation: ValidationResult
        applied: boolean
      }> = []
      
      let totalChanges = 0
      let filesModified = 0
      let errors = 0
      
      for (const file of files) {
        const filePath = resolve(baseDir, file)
        
        try {
          const content = await fs.readFile(filePath, 'utf-8')
          
          // Check if transformation applies to this file type
          const ext = extname(filePath)
          if (!rule.appliesTo.includes(ext)) {
            continue
          }
          
          // Generate changes
          const changes = rule.transform(content, options)
          
          if (changes.length === 0) {
            continue
          }
          
          // Validate changes
          const modifiedContent = applyChanges(content, changes)
          const validation = validateChanges(content, modifiedContent)
          
          // Apply changes if validation passes and not dry run
          let applied = false
          if (!dryRun && validation.valid) {
            await fs.writeFile(filePath, modifiedContent, 'utf-8')
            applied = true
            filesModified++
          }
          
          if (!validation.valid) {
            errors++
          }
          
          totalChanges += changes.length
          
          results.push({
            file: relative(baseDir, filePath),
            changes: preview ? changes : [],
            validation,
            applied
          })
        } catch (error) {
          console.warn(`Error processing ${file}: ${error}`)
          errors++
        }
      }
      
      // Build output string
      let output = `## Refactoring Report\n\n`
      output += `### Summary\n`
      output += `- **Transformation:** ${rule.name}\n`
      output += `- **Files Processed:** ${files.length}\n`
      output += `- **Files Modified:** ${filesModified}\n`
      output += `- **Total Changes:** ${totalChanges}\n`
      output += `- **Errors:** ${errors}\n`
      output += `- **Mode:** ${dryRun ? 'Dry Run (no changes applied)' : 'Live'}\n\n`
      
      if (results.length === 0) {
        output += `### No changes needed\n\n`
        output += `No files matched the transformation criteria or no changes were required.\n`
      } else {
        output += `### Changes by File\n\n`
        
        for (const result of results) {
          const statusEmoji = result.validation.valid ? (result.applied ? '✅' : '💡') : '❌'
          output += `${statusEmoji} **${result.file}**\n`
          output += `   Changes: ${result.changes.length}\n`
          
          if (result.validation.errors.length > 0) {
            output += `   Errors: ${result.validation.errors.join(', ')}\n`
          }
          
          if (result.validation.warnings.length > 0) {
            output += `   Warnings: ${result.validation.warnings.join(', ')}\n`
          }
          
          if (preview && result.changes.length > 0) {
            output += `\n   Preview of changes:\n`
            for (const change of result.changes.slice(0, 5)) {
              output += `   - Line ${change.startLine}: ${change.description}\n`
            }
            if (result.changes.length > 5) {
              output += `   ... and ${result.changes.length - 5} more changes\n`
            }
          }
          
          output += `\n`
        }
      }
      
      // Recommendations
      output += `### Recommendations\n\n`
      if (errors > 0) {
        output += `- ⚠️ ${errors} files had validation errors. Review them carefully.\n`
      }
      if (!dryRun) {
        output += `- ✅ Applied ${totalChanges} changes across ${filesModified} files\n`
      } else {
        output += `- 💡 This was a dry run. Set dryRun: false to apply changes\n`
      }
      if (results.some(r => r.validation.warnings.length > 0)) {
        output += `- ℹ️ Some files have warnings - review them carefully\n`
      }
      
      return output
    } catch (error) {
      throw new Error(`Refactoring failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
})
