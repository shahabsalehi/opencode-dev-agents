import { describe, expect, it } from "vitest"
import { classifyMcpTool, findMatchingCapabilityRule } from "../../../src/policy/mcp-capabilities.js"

describe("mcp capabilities", () => {
  it("classifies mcp tools by name hints", () => {
    expect(classifyMcpTool("mcp.server.read_file")).toBe("read")
    expect(classifyMcpTool("mcp.server.create_issue")).toBe("write")
    expect(classifyMcpTool("mcp.server.run_command")).toBe("execute")
    expect(classifyMcpTool("mcp.server.http_request")).toBe("network")
  })

  it("classifies by args when name is ambiguous", () => {
    expect(classifyMcpTool("mcp.server.action", { url: "https://example.com" })).toBe("network")
    expect(classifyMcpTool("mcp.server.action", { command: "ls" })).toBe("execute")
  })

  it("finds matching capability rule by server prefix", () => {
    const rule = findMatchingCapabilityRule("mcp.github.create_issue", [
      {
        serverPrefix: "mcp.github",
        maxCallsPerSession: 10,
        capabilities: ["read", "write", "execute", "network"],
      },
    ])
    expect(rule?.serverPrefix).toBe("mcp.github")
  })
})
