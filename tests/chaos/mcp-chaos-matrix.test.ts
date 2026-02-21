import { describe, expect, it } from "vitest"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../src/policy/defaults.js"
import { evaluatePolicy } from "../../src/policy/evaluate.js"
import { evaluateMcpAccess } from "../../src/policy/mcp-governance.js"
import { mcpRateLimiter } from "../../src/policy/mcp-rate-limit.js"
import type { StrictControlPolicy } from "../../src/policy/types.js"

describe("mcp chaos matrix", () => {
  it("keeps deterministic denial semantics for unstable/malformed mcp metadata", () => {
    mcpRateLimiter.reset()

    const policy = {
      ...DEFAULT_STRICT_CONTROL_POLICY,
      recordOnly: false,
      mcp: {
        enabled: true,
        allowlist: [],
        denylist: ["mcp.server.offline.read"],
        capabilityRules: [
          {
            serverPrefix: "mcp.server.github",
            maxCallsPerSession: 5,
            capabilities: ["read"],
          },
        ],
      },
    } satisfies StrictControlPolicy

    const matrix: Array<{
      toolName: string
      args?: Record<string, unknown>
      expectedAllowed: boolean
      expectedReason: string
    }> = [
      {
        toolName: "mcp.server.offline.read",
        args: { unstable: true, timeoutMs: 9999 },
        expectedAllowed: false,
        expectedReason: "mcp-denylist",
      },
      {
        toolName: "mcp.server.github.delete_repo",
        args: { metadata: { auth: { expiresAt: 0 } }, random: ["x", 1, null] },
        expectedAllowed: false,
        expectedReason: "mcp-capability-denied:write",
      },
      {
        toolName: "mcp.server.github.request",
        args: { headers: { Authorization: "expired" } },
        expectedAllowed: false,
        expectedReason: "mcp-capability-denied:network",
      },
    ]

    for (const [index, item] of matrix.entries()) {
      const sessionID = `bundle-23-matrix-${index}`
      const access = evaluateMcpAccess(item.toolName, policy, item.args, sessionID)
      expect(access.allowed).toBe(item.expectedAllowed)
      expect(access.reason).toBe(item.expectedReason)

      const policyEval = evaluatePolicy({ toolName: item.toolName, args: item.args }, policy, sessionID)
      expect(policyEval.decision).toBe("deny")
      expect(policyEval.reason).toBe(item.expectedReason)
    }
  })

  it("enforces per-session rate limits under noisy request payloads", () => {
    mcpRateLimiter.reset()

    const policy = {
      ...DEFAULT_STRICT_CONTROL_POLICY,
      recordOnly: false,
      mcp: {
        enabled: true,
        allowlist: [],
        denylist: [],
        capabilityRules: [
          {
            serverPrefix: "mcp.server.github",
            maxCallsPerSession: 2,
            capabilities: ["read", "write", "execute", "network"],
          },
        ],
      },
    } satisfies StrictControlPolicy

    const noisyArgs = {
      nested: { a: 1, b: [2, 3], c: { d: true } },
      malformedLike: "{not-json}",
      metadata: { tokenExpired: true },
    }

    const first = evaluateMcpAccess("mcp.server.github.list_issues", policy, noisyArgs, "chaos-s1")
    const second = evaluateMcpAccess("mcp.server.github.list_issues", policy, noisyArgs, "chaos-s1")
    const third = evaluateMcpAccess("mcp.server.github.list_issues", policy, noisyArgs, "chaos-s1")
    const otherSession = evaluateMcpAccess("mcp.server.github.list_issues", policy, noisyArgs, "chaos-s2")

    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(true)
    expect(third.allowed).toBe(false)
    expect(third.reason).toBe("mcp-rate-limit-exceeded")
    expect(otherSession.allowed).toBe(true)
  })

  it("denies unavailable or unknown servers with clear fallback reason", () => {
    mcpRateLimiter.reset()

    const policy = {
      ...DEFAULT_STRICT_CONTROL_POLICY,
      recordOnly: false,
      mcp: {
        enabled: true,
        allowlist: ["mcp.server.github.list_issues"],
        denylist: [],
        capabilityRules: [],
      },
    } satisfies StrictControlPolicy

    const unavailable = evaluateMcpAccess(
      "mcp.server.unavailable.list",
      policy,
      { serverStatus: "down", authState: "expired" },
      "chaos-fallback"
    )
    expect(unavailable.allowed).toBe(false)
    expect(unavailable.reason).toBe("mcp-not-allowlisted")

    const policyEval = evaluatePolicy(
      {
        toolName: "mcp.server.unavailable.list",
        args: { serverStatus: "down", authState: "expired" },
      },
      policy,
      "chaos-fallback"
    )
    expect(policyEval.decision).toBe("deny")
    expect(policyEval.reason).toBe("mcp-not-allowlisted")
  })
})
