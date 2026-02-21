import { describe, expect, it } from "vitest"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../../src/policy/defaults.js"
import { evaluateMcpAccess, isMcpTool } from "../../../src/policy/mcp-governance.js"
import { mcpRateLimiter } from "../../../src/policy/mcp-rate-limit.js"
import { evaluatePolicy } from "../../../src/policy/evaluate.js"

describe("mcp governance", () => {
  it("detects mcp tool name prefixes", () => {
    expect(isMcpTool("mcp.server.tool")).toBe(true)
    expect(isMcpTool("mcp__github__list")).toBe(true)
    expect(isMcpTool("codeAnalyzer")).toBe(false)
  })

  it("denies denylisted mcp tools", () => {
    mcpRateLimiter.reset()
    const policy = {
      ...DEFAULT_STRICT_CONTROL_POLICY,
      recordOnly: false,
      mcp: {
        enabled: true,
        allowlist: [],
        denylist: ["mcp.server.danger"],
        capabilityRules: [],
      },
    }

    const decision = evaluateMcpAccess("mcp.server.danger", policy)
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe("mcp-denylist")

    const evaluated = evaluatePolicy({ toolName: "mcp.server.danger" }, policy)
    expect(evaluated.decision).toBe("deny")
  })

  it("enforces allowlist when configured", () => {
    mcpRateLimiter.reset()
    const policy = {
      ...DEFAULT_STRICT_CONTROL_POLICY,
      mcp: {
        enabled: true,
        allowlist: ["mcp.server.safe"],
        denylist: [],
        capabilityRules: [],
      },
    }

    const blocked = evaluateMcpAccess("mcp.server.other", policy)
    const allowed = evaluateMcpAccess("mcp.server.safe", policy)
    expect(blocked.allowed).toBe(false)
    expect(allowed.allowed).toBe(true)
  })

  it("denies mcp tool when capability class is not allowed", () => {
    mcpRateLimiter.reset()
    const policy = {
      ...DEFAULT_STRICT_CONTROL_POLICY,
      mcp: {
        enabled: true,
        allowlist: [],
        denylist: [],
        capabilityRules: [
          {
            serverPrefix: "mcp.server",
            maxCallsPerSession: 3,
            capabilities: ["read"],
          },
        ],
      },
    }

    const blocked = evaluateMcpAccess("mcp.server.delete", policy, { id: 1 }, "ses-cap")
    expect(blocked.allowed).toBe(false)
    expect(blocked.reason).toBe("mcp-capability-denied:write")
  })

  it("enforces per-session mcp rate limits", () => {
    mcpRateLimiter.reset()
    const policy = {
      ...DEFAULT_STRICT_CONTROL_POLICY,
      mcp: {
        enabled: true,
        allowlist: [],
        denylist: [],
        capabilityRules: [
          {
            serverPrefix: "mcp.server",
            maxCallsPerSession: 1,
            capabilities: ["read", "write", "execute", "network"],
          },
        ],
      },
    }

    const first = evaluateMcpAccess("mcp.server.read", policy, {}, "ses-rate")
    const second = evaluateMcpAccess("mcp.server.read", policy, {}, "ses-rate")
    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(false)
    expect(second.reason).toBe("mcp-rate-limit-exceeded")

    const otherSession = evaluateMcpAccess("mcp.server.read", policy, {}, "ses-rate-2")
    expect(otherSession.allowed).toBe(true)
  })
})
