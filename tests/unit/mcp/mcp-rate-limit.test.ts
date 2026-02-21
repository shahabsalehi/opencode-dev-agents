import { describe, expect, it } from "vitest"
import { McpRateLimiter } from "../../../src/policy/mcp-rate-limit.js"

describe("mcp rate limiter", () => {
  it("allows requests below the session limit", () => {
    const limiter = new McpRateLimiter()
    const check = limiter.check("mcp.github", "ses-a", 2)
    expect(check.allowed).toBe(true)
    expect(check.used).toBe(0)
  })

  it("blocks when limit is reached", () => {
    const limiter = new McpRateLimiter()
    limiter.record("mcp.github", "ses-a")
    const check = limiter.check("mcp.github", "ses-a", 1)
    expect(check.allowed).toBe(false)
    expect(check.used).toBe(1)
  })

  it("tracks limits independently per session", () => {
    const limiter = new McpRateLimiter()
    limiter.record("mcp.github", "ses-a")

    const sessionA = limiter.check("mcp.github", "ses-a", 1)
    const sessionB = limiter.check("mcp.github", "ses-b", 1)
    expect(sessionA.allowed).toBe(false)
    expect(sessionB.allowed).toBe(true)
  })

  it("resets counters", () => {
    const limiter = new McpRateLimiter()
    limiter.record("mcp.github", "ses-a")
    limiter.reset()
    const check = limiter.check("mcp.github", "ses-a", 1)
    expect(check.allowed).toBe(true)
  })
})
