import { describe, expect, it } from "vitest"
import { getConfig, setConfig } from "../../../src/config.js"

describe("operator presets", () => {
  it("applies strict preset by default", () => {
    setConfig({})
    const config = getConfig()
    expect(config.mode).toBe("strict")
    expect(config.strictControl?.recordOnly).toBe(false)
    expect(config.approval?.enforce).toBe(true)
    expect(config.verification?.enforceOnMutation).toBe(true)
  })

  it("applies balanced preset", () => {
    setConfig({ mode: "balanced" })
    const config = getConfig()
    expect(config.mode).toBe("balanced")
    expect(config.strictControl?.recordOnly).toBe(true)
    expect(config.approval?.enforce).toBe(true)
  })

  it("applies research preset", () => {
    setConfig({ mode: "research" })
    const config = getConfig()
    expect(config.mode).toBe("research")
    expect(config.approval?.enforce).toBe(false)
    expect(config.verification?.enforceOnMutation).toBe(false)
  })

  it("applies autopilot preset", () => {
    setConfig({ mode: "autopilot" })
    const config = getConfig()
    expect(config.mode).toBe("autopilot")
    expect(config.planFirst?.enabled).toBe(true)
    expect(config.strictControl?.recordOnly).toBe(false)
    expect(config.autopilot?.cumulativeRiskThreshold).toBe(10)
  })

  it("preserves explicit overrides over preset", () => {
    setConfig({
      mode: "strict",
      strictControl: { recordOnly: true },
      approval: { ttlMs: 1234 },
    })
    const config = getConfig()
    expect(config.strictControl?.recordOnly).toBe(true)
    expect(config.approval?.ttlMs).toBe(1234)
  })
})
