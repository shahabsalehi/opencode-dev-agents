import { createHash } from "crypto"
import type { SecondOpinionConfig } from "./types.js"

const HIGH_RISK_MUTATION_TOOLS = new Set([
  "edit",
  "write",
  "apply_patch",
  "bash",
  "interactive_bash",
  "refactorEngine",
  "testGenerator",
])

export function shouldRequestSecondOpinion(input: {
  config: SecondOpinionConfig
  toolName: string
  risk: "low" | "medium" | "high" | "critical"
  filesModified: number
  planBlocked: boolean
  operatorMode: string
}): boolean {
  if (!input.config.enabled) return false
  if (!HIGH_RISK_MUTATION_TOOLS.has(input.toolName)) return false
  if (input.risk === "low") return false
  if (input.filesModified < input.config.minMutationsBeforeTrigger) return false
  if (input.planBlocked) return false
  if (input.operatorMode === "research") return false
  return true
}

export function computePlanHash(planTitle: string, planContent: string, toolName: string): string {
  return createHash("sha256")
    .update(`${planTitle}|${planContent}|${toolName}`)
    .digest("hex")
    .slice(0, 24)
}
