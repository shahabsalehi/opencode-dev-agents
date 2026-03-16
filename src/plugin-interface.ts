import type { Hooks } from "@opencode-ai/plugin"
import type { ToolDefinition } from "@opencode-ai/plugin/tool"

export function createPluginInterface(input: {
  tools: Record<string, ToolDefinition>
  hooks: Omit<Hooks, "tool"> 
}): Hooks {
  return {
    ...input.hooks,
    tool: input.tools,
  }
}
