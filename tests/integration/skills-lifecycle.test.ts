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

describe("integration: skills lifecycle", () => {
  it("executes allowlisted governed skill", async () => {
    const client = createClient({
      skills: {
        enabled: true,
        allowlist: ["safe-refactor"],
      },
    })

    const hooks = await plugin({
      client: client as never,
      directory: "/tmp/swe-int-skills",
      worktree: "/tmp/swe-int-skills",
      project: { id: "proj-skill", worktree: "/tmp/swe-int-skills", time: { created: Date.now() } },
      serverUrl: new URL("http://localhost:4096"),
      $: {} as never,
    })

    const listResult = await hooks.tool.skill_list.execute({}, {
      directory: "/tmp/swe-int-skills",
      sessionID: "ses-skill",
      agent: "build",
    })
    expect(String(listResult)).toContain("safe-refactor")

    const execResult = await hooks.tool.skill_execute.execute(
      { name: "safe-refactor" },
      {
        directory: "/tmp/swe-int-skills",
        sessionID: "ses-skill",
        agent: "build",
      }
    )
    expect(String(execResult)).toContain("dry-run")
  })
})
