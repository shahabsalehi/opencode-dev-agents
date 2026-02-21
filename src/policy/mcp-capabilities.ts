import type { McpCapabilityClass, McpCapabilityRule } from "./types.js"

const READ_HINTS = ["read", "list", "get", "fetch", "search", "query"]
const WRITE_HINTS = ["write", "create", "update", "edit", "delete", "remove", "set", "apply", "patch"]
const EXECUTE_HINTS = ["exec", "run", "command", "shell", "script"]
const NETWORK_HINTS = ["http", "request", "network", "web", "url"]

export function classifyMcpTool(toolName: string, args?: Record<string, unknown>): McpCapabilityClass {
  const normalizedName = toolName.toLowerCase()

  if (containsAny(normalizedName, NETWORK_HINTS) || hasAnyArg(args, ["url", "endpoint", "request", "headers"])) {
    return "network"
  }
  if (containsAny(normalizedName, EXECUTE_HINTS) || hasAnyArg(args, ["command", "script", "tmux_command"])) {
    return "execute"
  }
  if (containsAny(normalizedName, WRITE_HINTS)) {
    return "write"
  }
  if (containsAny(normalizedName, READ_HINTS)) {
    return "read"
  }

  return "execute"
}

export function findMatchingCapabilityRule(toolName: string, rules: McpCapabilityRule[]): McpCapabilityRule | undefined {
  return rules.find((rule) => toolName.startsWith(rule.serverPrefix))
}

function containsAny(value: string, hints: string[]): boolean {
  return hints.some((hint) => value.includes(hint))
}

function hasAnyArg(args: Record<string, unknown> | undefined, keys: string[]): boolean {
  if (!args) return false
  return keys.some((key) => key in args)
}
