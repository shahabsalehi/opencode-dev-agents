import { describe, expect, it, vi } from "vitest"
import plugin from "../../src/index.js"

function createClient(configObject: Record<string, unknown>) {
  return {
    file: {
      read: vi.fn().mockResolvedValue({
        data: {
          type: "text",
          content: JSON.stringify({
            plugin: {
              "swe-sworm": configObject,
            },
          }),
        },
      }),
    },
    app: {
      log: vi.fn().mockResolvedValue({}),
      agents: vi.fn().mockResolvedValue({ data: [{ name: "build" }] }),
    },
    session: {
      diff: vi.fn().mockResolvedValue({ data: [] }),
      todo: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn(),
      prompt: vi.fn(),
      messages: vi.fn(),
      abort: vi.fn(),
      summarize: vi.fn(),
      init: vi.fn(),
      status: vi.fn(),
    },
  }
}

describe("integration: mcp policy flow", () => {
  it("blocks denylisted mcp tools when strict non-record mode", async () => {
    const client = createClient({
      mode: "strict",
      strictControl: {
        recordOnly: false,
        mcpEnabled: true,
        mcpDenylist: ["mcp.server.deleteEverything"],
      },
    })

    const hooks = await plugin({
      client: client as never,
      directory: "/tmp/swe-int-mcp",
      worktree: "/tmp/swe-int-mcp",
      project: { id: "proj-mcp", worktree: "/tmp/swe-int-mcp", time: { created: Date.now() } },
      serverUrl: new URL("http://localhost:4096"),
      $: {} as never,
    })

    const beforeOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { path: "/" },
    }

    await hooks["tool.execute.before"]?.(
      {
        tool: "mcp.server.deleteEverything",
        sessionID: "ses-mcp",
        callID: "call-mcp-1",
      },
      beforeOutput
    )

    expect(beforeOutput.args).toBeUndefined()
    expect(String(beforeOutput.output)).toContain("Policy blocked")
    expect(beforeOutput.metadata?.policyBlocked).toBe(true)
  })
})
