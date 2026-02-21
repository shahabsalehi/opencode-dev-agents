import { describe, expect, it } from "vitest"
import { runDoctor } from "../../../src/doctor.js"
import { setConfig } from "../../../src/config.js"

describe("doctor", () => {
  it("returns a structured report", () => {
    setConfig({ mode: "balanced" })
    const report = runDoctor()

    expect(report.mode).toBe("balanced")
    expect(typeof report.strictControlEnabled).toBe("boolean")
    expect(typeof report.recordOnly).toBe("boolean")
    expect(typeof report.features.enableDelegationRuntime).toBe("boolean")
    expect(typeof report.checks.nodeVersionOk).toBe("boolean")
    expect(Array.isArray(report.deprecations)).toBe(true)
  })

  it("reports deprecations when legacy top-level fields are present", () => {
    setConfig({ mode: "balanced", mcpEnabled: true } as unknown as Parameters<typeof setConfig>[0])
    const report = runDoctor()
    expect(report.deprecations.length).toBeGreaterThan(0)
  })
})
