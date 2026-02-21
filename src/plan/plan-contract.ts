import type { ThoughtRecord } from "../thoughts/store.js"

export type PlanEvidence = {
  hasPlan: boolean
  planAge: number | null
  planTitle: string | null
}

export type PlanFirstConfig = {
  enabled: boolean
  maxPlanAgeMs: number
}

const PLAN_PREFIX = "plan:"

export function requiresPlan(toolName: string): boolean {
  const highRiskMutationTools = new Set([
    "edit",
    "write",
    "apply_patch",
    "bash",
    "testGenerator",
    "refactorEngine",
  ])
  return highRiskMutationTools.has(toolName)
}

export function evaluatePlanEvidence(thoughts: ThoughtRecord[], config: PlanFirstConfig): PlanEvidence {
  if (!config.enabled) {
    return { hasPlan: true, planAge: null, planTitle: null }
  }

  const now = Date.now()
  const planThoughts = thoughts
    .filter((item) => item.title.toLowerCase().startsWith(PLAN_PREFIX))
    .sort((a, b) => b.createdAt - a.createdAt)

  if (planThoughts.length === 0) {
    return { hasPlan: false, planAge: null, planTitle: null }
  }

  const latest = planThoughts[0]
  const age = now - latest.createdAt

  if (age > config.maxPlanAgeMs) {
    return { hasPlan: false, planAge: age, planTitle: latest.title }
  }

  return { hasPlan: true, planAge: age, planTitle: latest.title }
}
