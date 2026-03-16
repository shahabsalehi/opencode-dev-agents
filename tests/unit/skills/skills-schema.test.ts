import { describe, expect, it } from "vitest"
import { validateSkillDefinition } from "../../../src/skills/schema.js"

describe("skills schema", () => {
  it("validates a complete skill definition", () => {
    const result = validateSkillDefinition({
      name: "safe-refactor",
      description: "desc",
      prompt: "prompt",
      riskLevel: "low",
    })

    expect(result.valid).toBe(true)
    expect(result.skill?.name).toBe("safe-refactor")
  })

  it("rejects missing or invalid fields", () => {
    const result = validateSkillDefinition({
      name: "Bad Name",
      description: "",
      prompt: "",
      riskLevel: "critical",
    })

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
