import type { ToolDefinition } from "@opencode-ai/plugin/tool"
import { codeAnalyzer } from "./tools/code-analyzer.js"
import { dependencyGraph } from "./tools/dependency-graph.js"
import { testGenerator } from "./tools/test-generator.js"
import { bugDetector } from "./tools/bug-detector.js"
import { refactorEngine } from "./tools/refactor-engine.js"
import { reviewTool } from "./tools/review-tool.js"
import { lspGotoDefinition, lspFindReferences, lspDocumentSymbols, lspDiagnostics } from "./tools/lsp-tools.js"
import { astGrepSearch, astGrepReplace } from "./tools/ast-tools.js"

export function createCoreToolRegistry(): Record<string, ToolDefinition> {
  return {
    codeAnalyzer,
    dependencyGraph,
    testGenerator,
    bugDetector,
    refactorEngine,
    reviewTool,
    lspGotoDefinition,
    lspFindReferences,
    lspDocumentSymbols,
    lspDiagnostics,
    astGrepSearch,
    astGrepReplace,
  }
}
