import { describe, expect, it } from "vitest"
import { SkillsRegistry } from "../../../src/skills/registry.js"

describe("skills registry", () => {
  it("registers and lists skills", () => {
    const registry = new SkillsRegistry()
    registry.register({ name: "b", description: "B", prompt: "P2" })
    registry.register({ name: "a", description: "A", prompt: "P1" })

    expect(registry.get("a")?.prompt).toBe("P1")
    expect(registry.has("a")).toBe(true)
    expect(registry.count()).toBe(2)
    expect(registry.list().map((item) => item.name)).toEqual(["a", "b"])
  })
})
