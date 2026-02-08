import type { Hooks } from "@opencode-ai/plugin"
import { codeAnalyzer } from "./tools/code-analyzer.js"
import { dependencyGraph } from "./tools/dependency-graph.js"
import { testGenerator } from "./tools/test-generator.js"
import { bugDetector } from "./tools/bug-detector.js"
import { refactorEngine } from "./tools/refactor-engine.js"

export default async function plugin(): Promise<Hooks> {
  // State management for hooks
  const sessionMetrics = {
    toolCalls: 0,
    filesModified: 0,
    startTime: Date.now(),
    toolUsage: new Map<string, number>()
  }

  return {
    // Register all tools
    tool: {
      codeAnalyzer,
      dependencyGraph,
      testGenerator,
      bugDetector,
      refactorEngine
    },

    // Tool execution monitoring
    "tool.execute.before": async (input) => {
      try {
        const toolName = input.tool
        if (toolName) {
          sessionMetrics.toolCalls++
          sessionMetrics.toolUsage.set(
            toolName, 
            (sessionMetrics.toolUsage.get(toolName) || 0) + 1
          )
          
          console.log(`Executing tool: ${toolName}`)
        }
      } catch (error) {
        console.error("Tool execution hook error:", error)
      }
    },

    "tool.execute.after": async (input) => {
      try {
        const toolName = input.tool
        
        // Track file modifications
        if (toolName === "edit" || toolName === "write") {
          sessionMetrics.filesModified++
        }
      } catch (error) {
        console.error("Tool execution after hook error:", error)
      }
    }
  }
}

// Re-export tools for external use
export { codeAnalyzer, dependencyGraph, testGenerator, bugDetector, refactorEngine }