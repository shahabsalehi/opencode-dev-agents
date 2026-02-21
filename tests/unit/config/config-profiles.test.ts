import { describe, expect, it } from "vitest"
import { resolveProfile } from "../../../src/config-profiles.js"

describe("resolveProfile", () => {
  it("returns strict profile", () => {
    const preset = resolveProfile("strict")
    expect(preset.strictControl?.recordOnly).toBe(false)
    expect(preset.strictControl?.adaptive?.enabled).toBe(true)
    expect(preset.approval?.enforce).toBe(true)
  })

  it("returns balanced profile", () => {
    const preset = resolveProfile("balanced")
    expect(preset.strictControl?.recordOnly).toBe(true)
  })

  it("returns research profile", () => {
    const preset = resolveProfile("research")
    expect(preset.approval?.enforce).toBe(false)
    expect(preset.verification?.enforceOnMutation).toBe(false)
  })

  it("returns autopilot profile", () => {
    const preset = resolveProfile("autopilot")
    expect(preset.strictControl?.recordOnly).toBe(false)
    expect(preset.planFirst?.enabled).toBe(true)
    expect(preset.autopilot?.cumulativeRiskThreshold).toBe(10)
  })
})
