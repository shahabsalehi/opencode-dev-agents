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

describe("integration: optional hooks", () => {
  it("enables text.complete and auth hooks when compatibility flags are enabled", async () => {
    const client = createClient({
      mode: "strict",
      strictControl: { recordOnly: false },
      compatibility: {
        enableTextCompleteHook: true,
        enableAuthHook: true,
      },
    })

    const hooks = await plugin({
      client: client as never,
      directory: "/tmp/swe-int-opt",
      worktree: "/tmp/swe-int-opt",
      project: { id: "proj-opt", worktree: "/tmp/swe-int-opt", time: { created: Date.now() } },
      serverUrl: new URL("http://localhost:4096"),
      $: {} as never,
    })

    const output = { text: "base-text" }
    await hooks["experimental.text.complete"]?.(
      { sessionID: "ses-opt", messageID: "msg-opt", partID: "part-opt" },
      output
    )

    expect(output.text).toContain("verified-output")
    expect(hooks.auth?.provider).toBe("swe-sworm-governance")
  })

  it("keeps optional hooks inert/absent when flags are disabled", async () => {
    const client = createClient({
      compatibility: {
        enableTextCompleteHook: false,
        enableAuthHook: false,
      },
    })

    const hooks = await plugin({
      client: client as never,
      directory: "/tmp/swe-int-opt-off",
      worktree: "/tmp/swe-int-opt-off",
      project: { id: "proj-opt-off", worktree: "/tmp/swe-int-opt-off", time: { created: Date.now() } },
      serverUrl: new URL("http://localhost:4096"),
      $: {} as never,
    })

    const output = { text: "base-text" }
    await hooks["experimental.text.complete"]?.(
      { sessionID: "ses-opt-off", messageID: "msg-opt-off", partID: "part-opt-off" },
      output
    )

    expect(output.text).toBe("base-text")
    expect(hooks.auth).toBeUndefined()
  })
})
