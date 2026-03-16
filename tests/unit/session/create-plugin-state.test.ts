import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { describe, expect, it, vi } from "vitest"
import { createPluginState } from "../../../src/create-plugin-state.js"

function createClient(configObject?: Record<string, unknown>) {
  return {
    file: {
      read: vi.fn().mockImplementation(async () => {
        if (!configObject) {
          throw new Error("missing config")
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
      agents: vi.fn().mockResolvedValue({ data: [{ name: "build" }, { name: "research" }] }),
    },
    session: {
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

describe("create plugin state", () => {
  it("builds state with default skills and resolved feature flags", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swe-plugin-state-"))
    const state = await createPluginState({
      client: createClient({ compatibility: { enableTextCompleteHook: true } }) as never,
      directory,
      worktree: directory,
      project: { id: "proj-state", worktree: directory, time: { created: Date.now() } } as never,
      serverUrl: new URL("http://localhost:4096"),
    })

    expect(state.featureFlags.enableTextCompleteHook).toBe(true)
    expect(state.skillsRegistry.list().map((skill) => skill.name)).toEqual(
      expect.arrayContaining([
        "governance-review",
        "safe-refactor",
        "dependency-audit",
        "test-gap-finder",
        "migration-planner",
        "code-review-checklist",
      ])
    )
    expect(state.availableAgents.has("build")).toBe(true)

    await rm(directory, { recursive: true, force: true })
  })

  it("disables delegation runtime when compatibility flag is false", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swe-plugin-state-"))
    const state = await createPluginState({
      client: createClient({ compatibility: { enableDelegationRuntime: false } }) as never,
      directory,
      worktree: directory,
      project: { id: "proj-state-2", worktree: directory, time: { created: Date.now() } } as never,
      serverUrl: new URL("http://localhost:4096"),
    })

    expect(state.delegationRuntime).toBeNull()

    await rm(directory, { recursive: true, force: true })
  })
})
