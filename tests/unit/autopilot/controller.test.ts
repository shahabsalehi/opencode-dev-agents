import { describe, expect, it } from "vitest"
import { AutopilotController } from "../../../src/autopilot/controller.js"

describe("AutopilotController", () => {
  it("tracks steps and cumulative risk", () => {
    const controller = new AutopilotController(10, 5)
    controller.startStep("s1", "edit")
    controller.completeStep("s1", 1.5)

    const status = controller.getStatus("s1")
    expect(status.stepCount).toBe(1)
    expect(status.cumulativeRisk).toBe(1.5)
    expect(status.paused).toBe(false)
  })

  it("pauses when threshold is reached and resumes on approval", () => {
    const controller = new AutopilotController(2, 10)
    controller.startStep("s2", "bash")
    controller.completeStep("s2", 2)
    expect(controller.shouldPause("s2")).toBe(true)

    controller.resume("s2")
    const status = controller.getStatus("s2")
    expect(status.paused).toBe(false)
    expect(status.stepCount).toBe(0)
    expect(status.cumulativeRisk).toBe(0)
  })
})
