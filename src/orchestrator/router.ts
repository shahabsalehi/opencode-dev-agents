export type TaskCategory = "quick" | "analysis" | "write" | "review" | "deep"

export type RoutingDecision = {
  category: TaskCategory
  agent: string
  modelHint: "small" | "default" | "strong"
  requiresApproval: boolean
  reason: string
}

const WRITE_KEYWORDS = [
  "implement",
  "create",
  "fix",
  "refactor",
  "edit",
  "write",
  "patch",
  "update",
]

const REVIEW_KEYWORDS = ["review", "audit", "check", "quality", "security", "lint"]
const ANALYSIS_KEYWORDS = ["analyze", "investigate", "search", "find", "trace", "explain"]
const DEEP_KEYWORDS = ["architecture", "design", "migration", "multi", "system", "complex"]

function containsAny(input: string, keywords: string[]): boolean {
  return keywords.some((keyword) => input.includes(keyword))
}

export function routeTask(prompt: string, requestedAgent?: string): RoutingDecision {
  if (requestedAgent && requestedAgent !== "auto") {
    return {
      category: "analysis",
      agent: requestedAgent,
      modelHint: "default",
      requiresApproval: requestedAgent !== "explore",
      reason: "explicit-agent",
    }
  }

  const normalized = prompt.toLowerCase()

  if (containsAny(normalized, DEEP_KEYWORDS)) {
    return {
      category: "deep",
      agent: "code-architect",
      modelHint: "strong",
      requiresApproval: false,
      reason: "deep-keywords",
    }
  }

  if (containsAny(normalized, WRITE_KEYWORDS)) {
    return {
      category: "write",
      agent: "refactor-bot",
      modelHint: "strong",
      requiresApproval: true,
      reason: "write-keywords",
    }
  }

  if (containsAny(normalized, REVIEW_KEYWORDS)) {
    return {
      category: "review",
      agent: "code-reviewer",
      modelHint: "default",
      requiresApproval: false,
      reason: "review-keywords",
    }
  }

  if (containsAny(normalized, ANALYSIS_KEYWORDS)) {
    return {
      category: "analysis",
      agent: "explore",
      modelHint: "small",
      requiresApproval: false,
      reason: "analysis-keywords",
    }
  }

  return {
    category: "quick",
    agent: "explore",
    modelHint: "small",
    requiresApproval: false,
    reason: "default",
  }
}
