import { describe, expect, it } from "vitest"
import { routeTask } from "../../../src/orchestrator/router.js"

describe("routeTask", () => {
  it("routes deep architecture prompts to code-architect", () => {
    const decision = routeTask("Design architecture for a multi system migration", "auto")
    expect(decision.category).toBe("deep")
    expect(decision.agent).toBe("code-architect")
    expect(decision.modelHint).toBe("strong")
  })

  it("routes write prompts to refactor-bot", () => {
    const decision = routeTask("Implement and fix auth flow", "auto")
    expect(decision.category).toBe("write")
    expect(decision.agent).toBe("refactor-bot")
    expect(decision.requiresApproval).toBe(true)
  })

  it("respects explicit agent selection", () => {
    const decision = routeTask("anything", "explore")
    expect(decision.agent).toBe("explore")
    expect(decision.reason).toBe("explicit-agent")
  })
})
