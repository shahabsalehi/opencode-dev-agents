import { evaluatePolicy } from "../policy/evaluate.js"
import type { StrictControlPolicy } from "../policy/types.js"
import type { EvalScenario } from "./eval-scenarios.js"

export type EvalResult = {
  scenarioID: string
  passed: boolean
  actual: { decision: string; risk: string }
  expected: { decision: string; minRisk: string }
  reason: string
}

export type EvalSummary = {
  total: number
  passed: number
  failed: number
  passRate: number
  results: EvalResult[]
}

const riskOrder = ["low", "medium", "high", "critical"] as const

function riskAtLeast(actual: string, minimum: string): boolean {
  const actualIndex = riskOrder.indexOf(actual as (typeof riskOrder)[number])
  const minIndex = riskOrder.indexOf(minimum as (typeof riskOrder)[number])
  if (actualIndex === -1 || minIndex === -1) return false
  return actualIndex >= minIndex
}

export function runEvalScenarios(scenarios: EvalScenario[], policy: StrictControlPolicy): EvalSummary {
  const results: EvalResult[] = scenarios.map((scenario) => {
    const evaluation = evaluatePolicy(scenario.input, policy)
    const decisionMatch = evaluation.decision === scenario.expectedDecision
    const riskMatch = riskAtLeast(evaluation.risk, scenario.expectedMinRisk)
    const passed = decisionMatch && riskMatch
    return {
      scenarioID: scenario.id,
      passed,
      actual: {
        decision: evaluation.decision,
        risk: evaluation.risk,
      },
      expected: {
        decision: scenario.expectedDecision,
        minRisk: scenario.expectedMinRisk,
      },
      reason: evaluation.reason,
    }
  })

  const passed = results.filter((item) => item.passed).length
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length > 0 ? passed / results.length : 0,
    results,
  }
}
