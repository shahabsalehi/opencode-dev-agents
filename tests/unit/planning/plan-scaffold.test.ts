import { describe, expect, it } from "vitest"
import { buildPlanScaffold } from "../../../src/plan/scaffold.js"

describe("plan scaffold", () => {
  it("builds scaffold sections for edit", () => {
    const scaffold = buildPlanScaffold("edit", { filePath: "src/a.ts" })
    expect(scaffold).toContain("plan: Update src/a.ts")
    expect(scaffold).toContain("## Goal")
    expect(scaffold).toContain("## Steps")
    expect(scaffold).toContain("## Risks")
  })

  it("uses shell title for bash tools", () => {
    const scaffold = buildPlanScaffold("bash", { filePath: "package.json" })
    expect(scaffold).toContain("Run shell operation")
  })
})
