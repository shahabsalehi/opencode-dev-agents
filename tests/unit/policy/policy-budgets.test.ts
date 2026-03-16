import { describe, expect, it } from "vitest"
import type { SessionRunState } from "../../../src/audit/run-ledger.js"
import { evaluateBudgetGate, shouldBlockForBudget } from "../../../src/policy/budgets.js"
import { resolveProfile } from "../../../src/config-profiles.js"

function makeState(partial: Partial<SessionRunState>): SessionRunState {
  return {
    sessionID: "s",
    startedAt: Date.now(),
    lastUpdatedAt: Date.now(),
    toolCalls: 0,
    filesModified: 0,
    policy: {
      allow: 0,
      deny: 0,
      needsApproval: 0,
      byRisk: { low: 0, medium: 0, high: 0, critical: 0 },
    },
    ...partial,
  }
}

describe("policy budgets", () => {
  it("flags when tool call budget is exceeded", () => {
    const result = evaluateBudgetGate(
      makeState({ toolCalls: 26 }),
      "read",
      { filePath: "src/index.ts" },
      { maxChangedFiles: 5, maxTotalLocDelta: 400, maxNewFiles: 5, maxToolCalls: 25 }
    )
    expect(result.exceeded).toBe(true)
    expect(result.reason).toContain("budget-tool-calls-exceeded")
  })

  it("flags when mutation file budget is exceeded", () => {
    const result = evaluateBudgetGate(
      makeState({ filesModified: 5 }),
      "apply_patch",
      {},
      { maxChangedFiles: 5, maxTotalLocDelta: 400, maxNewFiles: 5, maxToolCalls: 25 }
    )
    expect(result.exceeded).toBe(true)
    expect(result.reason).toContain("budget-files-modified-exceeded")
  })

  it("does not flag read-only call within budget", () => {
    const result = evaluateBudgetGate(
      makeState({ toolCalls: 10, filesModified: 5 }),
      "read",
      {},
      { maxChangedFiles: 5, maxTotalLocDelta: 400, maxNewFiles: 5, maxToolCalls: 25 }
    )
    expect(result.exceeded).toBe(false)
  })

  it("does not block budget-exceeded call after approval", () => {
    expect(shouldBlockForBudget({ exceeded: true, approved: true, scopedGranted: false })).toBe(false)
    expect(shouldBlockForBudget({ exceeded: true, approved: false, scopedGranted: true })).toBe(false)
    expect(shouldBlockForBudget({ exceeded: true, approved: false, scopedGranted: false })).toBe(true)
  })

  it("applies tighter strict profile budgets than balanced profile", () => {
    const strictBudgets = resolveProfile("strict").strictControl?.budgets
    const balancedBudgets = resolveProfile("balanced").strictControl?.budgets
    expect(strictBudgets).toBeDefined()
    expect(balancedBudgets).toBeDefined()
    expect((strictBudgets?.maxChangedFiles ?? 0)).toBeLessThan((balancedBudgets?.maxChangedFiles ?? 0))
    expect((strictBudgets?.maxToolCalls ?? 0)).toBeLessThan((balancedBudgets?.maxToolCalls ?? 0))
  })
})
