import { describe, expect, it } from "vitest"
import { loadAvailableAgents, readSessionDiffSummary, readTodoPressure } from "../../../src/sdk/governance-insights.js"

describe("governance insights", () => {
  it("loads available agent names", async () => {
    const agents = await loadAvailableAgents({
      app: {
        agents: async () => ({ data: [{ name: "build" }, { name: "explore" }] }),
      },
    })

    expect(agents.has("build")).toBe(true)
    expect(agents.has("explore")).toBe(true)
  })

  it("summarizes diff totals", async () => {
    const summary = await readSessionDiffSummary(
      {
        session: {
          diff: async () => ({
            data: [
              { file: "a.ts", additions: 3, deletions: 1 },
              { file: "b.ts", additions: 2, deletions: 4 },
            ],
          }),
          todo: async () => ({ data: [] }),
        },
      },
      "ses_1",
      "/repo"
    )

    expect(summary).toEqual({ files: 2, additions: 5, deletions: 5 })
  })

  it("summarizes todo pressure", async () => {
    const pressure = await readTodoPressure(
      {
        session: {
          diff: async () => ({ data: [] }),
          todo: async () => ({
            data: [
              { id: "1", status: "pending" },
              { id: "2", status: "in_progress" },
              { id: "3", status: "completed" },
            ],
          }),
        },
      },
      "ses_1",
      "/repo"
    )

    expect(pressure).toEqual({ pending: 1, inProgress: 1, total: 3 })
  })
})
