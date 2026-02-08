import { tool } from "@opencode-ai/plugin/tool"
import { promises as fs } from "fs"
import { resolve, join, dirname } from "path"
import { cwd } from "process"

/**
 * Test Generator Tool
 * 
 * Generates test cases based on code analysis:
 * - Identifies untested code paths
 * - Creates test scaffolding
 * - Generates edge cases
 * - Produces property-based tests
 */

interface TestCase {
  name: string
  description: string
  input: Record<string, unknown>
  expectedOutput?: unknown
  edgeCases: string[]
}

interface FunctionSignature {
  name: string
  parameters: Parameter[]
  returnType?: string
  async: boolean
  exported: boolean
}

interface Parameter {
  name: string
  type?: string
  optional: boolean
  defaultValue?: string
}

// Language-specific parsing
const languageParsers = {
  javascript: {
    functionRegex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)|(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>|(\w+)\s*:\s*(?:async\s*)?\(([^)]*)\)\s*=>/g,
    classRegex: /class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g,
    methodRegex: /(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*\{/g,
    typeRegex: /:\s*([A-Za-z0-9_<>[\]|&]+)/
  },
  python: {
    functionRegex: /def\s+(\w+)\s*\(([^)]*)\):/g,
    classRegex: /class\s+(\w+)(?:\(([^)]+)\))?:/g,
    methodRegex: /def\s+(\w+)\s*\((?:self|cls),?\s*([^)]*)\):/g
  },
  go: {
    functionRegex: /func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(([^)]*)\)(?:\s*\(?([^\{]+)\)?)?/g,
    structRegex: /type\s+(\w+)\s+struct\s*\{/g
  }
}

function detectLanguage(filePath: string): keyof typeof languageParsers | null {
  const ext = filePath.split('.').pop()?.toLowerCase()
  const map: Record<string, keyof typeof languageParsers> = {
    'js': 'javascript', 'ts': 'javascript', 'jsx': 'javascript', 'tsx': 'javascript',
    'py': 'python',
    'go': 'go'
  }
  return ext ? map[ext] || null : null
}

function parseParameters(paramString: string): Parameter[] {
  if (!paramString.trim()) return []
  
  const params: Parameter[] = []
  const parts = paramString.split(',').map(p => p.trim())
  
  for (const part of parts) {
    if (!part) continue
    
    // Handle TypeScript/JavaScript syntax
    const tsMatch = part.match(/(\w+)\s*\??:\s*([^=]+)(?:\s*=\s*(.+))?/)
    if (tsMatch) {
      params.push({
        name: tsMatch[1],
        type: tsMatch[2]?.trim(),
        optional: part.includes('?') || !!tsMatch[3],
        defaultValue: tsMatch[3]?.trim()
      })
      continue
    }
    
    // Handle Python syntax
    const pyMatch = part.match(/(\w+)(?:\s*:\s*([^=]+))?(?:\s*=\s*(.+))?/)
    if (pyMatch) {
      params.push({
        name: pyMatch[1],
        type: pyMatch[2]?.trim(),
        optional: !!pyMatch[3],
        defaultValue: pyMatch[3]?.trim()
      })
      continue
    }
    
    // Simple parameter
    params.push({
      name: part,
      optional: false
    })
  }
  
  return params
}

function extractFunctions(content: string, language: keyof typeof languageParsers): FunctionSignature[] {
  const functions: FunctionSignature[] = []
  const parser = languageParsers[language]
  
  if (!parser) return functions
  
  // Extract functions
  let match: RegExpExecArray | null
  const regex = new RegExp(parser.functionRegex.source, 'g')
  
  while ((match = regex.exec(content)) !== null) {
    const funcName = match[1] || match[3] || match[5]
    const paramsStr = match[2] || match[4] || match[6] || ''
    
    if (funcName) {
      functions.push({
        name: funcName,
        parameters: parseParameters(paramsStr),
        async: content.substring(match.index - 10, match.index).includes('async'),
        exported: content.substring(match.index - 20, match.index).includes('export')
      })
    }
  }
  
  return functions
}

function generateTestValues(type: string | undefined): unknown[] {
  if (!type) return ['test-value', 123, true, null]
  
  const lowerType = type.toLowerCase()
  
  if (lowerType.includes('string')) {
    return ['', 'valid-string', 'a'.repeat(1000), 'special!@#$%^&*()', null]
  }
  if (lowerType.includes('number') || lowerType.includes('int')) {
    return [0, 1, -1, 999999, -999999, 0.1, -0.1, NaN, Infinity, -Infinity]
  }
  if (lowerType.includes('bool')) {
    return [true, false, null]
  }
  if (lowerType.includes('array') || lowerType.includes('[]')) {
    return [[], [1, 2, 3], ['a', 'b'], null]
  }
  if (lowerType.includes('object') || lowerType.includes('{}')) {
    return [{}, { key: 'value' }, { nested: { deep: 'value' } }, null]
  }
  
  return ['test-value', 123, true, null, undefined]
}

function generateTestCases(func: FunctionSignature, _framework: string): TestCase[] {
  const testCases: TestCase[] = []
  
  // Happy path test
  const happyPathInput: Record<string, unknown> = {}
  func.parameters.forEach(param => {
    const values = generateTestValues(param.type)
    happyPathInput[param.name] = values[1] || values[0] // Use second value (usually valid)
  })
  
  testCases.push({
    name: `should ${func.name.replace(/([A-Z])/g, ' $1').toLowerCase()} with valid input`,
    description: `Happy path test for ${func.name}`,
    input: happyPathInput,
    edgeCases: []
  })
  
  // Edge case tests for each parameter
  func.parameters.forEach((param) => {
    const edgeValues = generateTestValues(param.type)
    
    edgeValues.forEach((value, i) => {
      if (i === 1) return // Skip the happy path value
      
      const input = { ...happyPathInput }
      input[param.name] = value
      
      testCases.push({
        name: `should handle ${param.name} = ${JSON.stringify(value)}`,
        description: `Edge case: ${param.name} with ${JSON.stringify(value)}`,
        input,
        edgeCases: [`Parameter: ${param.name}`, `Value: ${JSON.stringify(value)}`]
      })
    })
  })
  
  // Error case - missing required parameters
  if (func.parameters.some(p => !p.optional)) {
    const missingInput: Record<string, unknown> = {}
    func.parameters.forEach(param => {
      if (param.optional || param.defaultValue) {
        missingInput[param.name] = generateTestValues(param.type)[1]
      }
    })
    
    testCases.push({
      name: `should throw error when required parameters are missing`,
      description: 'Error handling test',
      input: missingInput,
      edgeCases: ['Missing required parameters']
    })
  }
  
  // Async-specific test
  if (func.async) {
    testCases.push({
      name: `should handle async operation correctly`,
      description: 'Async operation test',
      input: happyPathInput,
      edgeCases: ['Promise resolution', 'Async/await pattern']
    })
  }
  
  return testCases.slice(0, 10) // Limit test cases
}

function generateTestCode(
  func: FunctionSignature,
  testCases: TestCase[],
  framework: string,
  filePath: string
): string {
  const importPath = filePath.replace(/\.(ts|tsx|js|jsx)$/, '')
  
  let testCode = ''
  
  // Framework-specific imports
  switch (framework) {
    case 'jest':
      testCode += `import { ${func.name} } from '${importPath}'\n\n`
      testCode += `describe('${func.name}', () => {\n`
      break
    case 'vitest':
      testCode += `import { describe, it, expect } from 'vitest'\n`
      testCode += `import { ${func.name} } from '${importPath}'\n\n`
      testCode += `describe('${func.name}', () => {\n`
      break
    case 'mocha':
      testCode += `const { expect } = require('chai')\n`
      testCode += `const { ${func.name} } = require('${importPath}')\n\n`
      testCode += `describe('${func.name}', () => {\n`
      break
    case 'pytest':
      testCode += `import pytest\n`
      testCode += `from ${importPath.replace(/\//g, '.')} import ${func.name}\n\n`
      testCode += `class Test${func.name.charAt(0).toUpperCase() + func.name.slice(1)}:\n`
      break
    default:
      testCode += `// Test for ${func.name}\n`
  }
  
  // Generate test cases
  testCases.forEach((testCase) => {
    const testName = testCase.name.replace(/'/g, "\\'")
    
    if (framework === 'pytest') {
      testCode += `    def test_${testName.replace(/\s+/g, '_').toLowerCase()}(self):\n`
      testCode += `        # ${testCase.description}\n`
      testCode += `        result = ${func.name}(${Object.entries(testCase.input).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')})\n`
      testCode += `        # Add assertions here\n`
      testCode += `        assert result is not None\n\n`
    } else {
      testCode += `  it('${testName}', ${func.async ? 'async ' : ''}() => {\n`
      testCode += `    // ${testCase.description}\n`
      
      if (func.async) {
        testCode += `    const result = await ${func.name}(${Object.entries(testCase.input).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')})\n`
      } else {
        testCode += `    const result = ${func.name}(${Object.entries(testCase.input).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')})\n`
      }
      
      testCode += `    // Add assertions here\n`
      testCode += `    expect(result).toBeDefined()\n`
      testCode += `  })\n\n`
    }
  })
  
  if (framework !== 'pytest') {
    testCode += `})\n`
  }
  
  return testCode
}

export const testGenerator = tool({
  description: "Generates comprehensive test cases and test files for code. Analyzes functions, identifies edge cases, and creates test scaffolding with minimal token usage.",
  args: {
    sourceFiles: tool.schema.array(tool.schema.string()).describe("Source files to generate tests for"),
    framework: tool.schema.enum(["jest", "vitest", "mocha", "pytest", "go-test", "rust-test"]).default("jest").describe("Testing framework to use"),
    includePrivate: tool.schema.boolean().default(false).describe("Include tests for non-exported/private functions"),
    outputDir: tool.schema.string().optional().describe("Output directory for generated test files (defaults to same directory as source)")
  },
  async execute(args) {
    const { sourceFiles, framework, includePrivate, outputDir } = args
    const baseDir = cwd()
    
    try {
      const generatedTests: Array<{
        targetFunction: string
        testCases: TestCase[]
        framework: string
        filePath: string
      }> = []
      
      const summary = {
        filesAnalyzed: 0,
        functionsFound: 0,
        testCasesGenerated: 0,
        filesWritten: 0,
        estimatedCoverage: 0
      }
      
      for (const sourceFile of sourceFiles) {
        const filePath = resolve(baseDir, sourceFile)
        
        try {
          const content = await fs.readFile(filePath, 'utf-8')
          const language = detectLanguage(filePath)
          
          if (!language) {
            console.warn(`Unsupported file type: ${filePath}`)
            continue
          }
          
          summary.filesAnalyzed++
          
          // Extract functions
          const functions = extractFunctions(content, language)
          
          // Filter exported functions unless includePrivate is true
          const targetFunctions = includePrivate 
            ? functions 
            : functions.filter(f => f.exported || language === 'python')
          
          for (const func of targetFunctions) {
            summary.functionsFound++
            
            // Generate test cases
            const testCases = generateTestCases(func, framework)
            summary.testCasesGenerated += testCases.length
            
            // Determine output file path
            const dir = dirname(filePath)
            const baseName = filePath.split('/').pop()?.replace(/\.(ts|tsx|js|jsx|py|go)$/, '') || 'test'
            const testFileName = framework === 'pytest' 
              ? `test_${baseName}.py`
              : `${baseName}.test.${language === 'javascript' ? 'ts' : 'js'}`
            const testFilePath = outputDir 
              ? resolve(baseDir, outputDir, testFileName)
              : join(dir, testFileName)
            
            generatedTests.push({
              targetFunction: func.name,
              testCases,
              framework,
              filePath: testFilePath
            })
          }
        } catch (error) {
          console.warn(`Error processing ${sourceFile}: ${error}`)
        }
      }
      
      // Write test files
      for (const test of generatedTests) {
        try {
          const testCode = generateTestCode(
            { name: test.targetFunction, parameters: [], async: false, exported: true },
            test.testCases,
            test.framework,
            test.filePath
          )
          
          // Ensure directory exists
          await fs.mkdir(dirname(test.filePath), { recursive: true })
          
          // Write test file
          await fs.writeFile(test.filePath, testCode, 'utf-8')
          summary.filesWritten++
        } catch (error) {
          console.warn(`Error writing test file ${test.filePath}: ${error}`)
        }
      }
      
      // Calculate estimated coverage
      summary.estimatedCoverage = summary.functionsFound > 0 
        ? Math.min(100, Math.round((summary.testCasesGenerated / (summary.functionsFound * 3)) * 100))
        : 0
      
      // Build output string
      let output = `## Test Generation Report\n\n`
      output += `### Summary\n`
      output += `- **Framework:** ${framework}\n`
      output += `- **Files Analyzed:** ${summary.filesAnalyzed}\n`
      output += `- **Functions Found:** ${summary.functionsFound}\n`
      output += `- **Test Cases Generated:** ${summary.testCasesGenerated}\n`
      output += `- **Test Files Written:** ${summary.filesWritten}\n`
      output += `- **Estimated Coverage:** ${summary.estimatedCoverage}%\n\n`
      
      if (generatedTests.length === 0) {
        output += `### No tests generated\n\n`
        output += `No functions found to test. Check file paths and language support.\n`
      } else {
        output += `### Generated Tests by File\n\n`
        
        // Group by source file
        const testsBySource = generatedTests.reduce((acc, test) => {
          const sourceDir = dirname(test.filePath)
          if (!acc[sourceDir]) acc[sourceDir] = []
          acc[sourceDir].push(test)
          return acc
        }, {} as Record<string, typeof generatedTests>)
        
        for (const [dir, tests] of Object.entries(testsBySource)) {
          output += `**${dir.replace(baseDir, '').replace(/^\//, '') || 'root'}**\n`
          for (const test of tests) {
            const fileName = test.filePath.split('/').pop()
            output += `- ${fileName}: ${test.testCases.length} test cases for ${test.targetFunction}\n`
          }
          output += `\n`
        }
      }
      
      // Recommendations
      output += `### Recommendations\n\n`
      if (summary.estimatedCoverage < 70) {
        output += `- ⚠️ Low estimated coverage (${summary.estimatedCoverage}%). Consider adding more edge cases.\n`
      }
      if (summary.functionsFound === 0) {
        output += `- ℹ️ No functions found. Check file paths and language support.\n`
      }
      output += `- ✅ Generated ${summary.testCasesGenerated} test cases across ${summary.functionsFound} functions\n`
      output += `- ✅ Written ${summary.filesWritten} test files\n`
      output += `- 💡 Review generated tests and add specific assertions based on expected behavior\n`
      
      return output
    } catch (error) {
      throw new Error(`Test generation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
})
