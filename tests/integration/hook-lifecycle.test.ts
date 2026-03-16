import { describe, expect, it, vi } from "vitest"
import plugin from "../../src/index.js"

function createClient(configObject?: Record<string, unknown>) {
  return {
    file: {
      read: vi.fn().mockImplementation(async () => {
        if (!configObject) {
          throw new Error("no config")
        }
        return {
          data: {
            type: "text",
            content: JSON.stringify({
              plugin: {
                "swe-sworm": configObject,
              },
            }),
          },
        }
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

describe("integration: hook lifecycle", () => {
  it("creates pending approval for edit tool in strict mode", async () => {
    const client = createClient({
      mode: "strict",
      approval: { enforce: true },
      strictControl: { recordOnly: false },
    })

    const hooks = await plugin({
      client: client as never,
      directory: "/tmp/swe-int-hooks",
      worktree: "/tmp/swe-int-hooks",
      project: { id: "proj-hook", worktree: "/tmp/swe-int-hooks", time: { created: Date.now() } },
      serverUrl: new URL("http://localhost:4096"),
      $: {} as never,
    })

    const beforeOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
    }

    await hooks["tool.execute.before"]?.(
      { tool: "edit", sessionID: "ses-hook", callID: "call-hook-1" },
      beforeOutput
    )

    expect(beforeOutput.args).toBeUndefined()

    const afterOutput: { output?: unknown; title?: string; metadata?: Record<string, unknown> } = {}
    await hooks["tool.execute.after"]?.(
      {
        tool: "edit",
        sessionID: "ses-hook",
        callID: "call-hook-1",
        args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
      },
      afterOutput
    )

    expect(String(afterOutput.output)).toContain("Approval required")
    expect(afterOutput.metadata?.approvalBlocked).toBe(true)
  })
})
