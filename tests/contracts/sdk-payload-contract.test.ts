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
      agents: vi.fn().mockResolvedValue({ data: [{ name: "build" }, { name: "oracle" }] }),
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

describe("sdk payload contract", () => {
  it("accepts baseline sdk payload envelope for tool hooks", async () => {
    const hooks = await plugin({
      client: createClient({
        mode: "strict",
        approval: { enforce: false },
        strictControl: { recordOnly: true },
      }) as never,
      directory: "/tmp/swe-bundle-17-base",
      worktree: "/tmp/swe-bundle-17-base",
      project: { id: "proj-bundle-17-base", worktree: "/tmp/swe-bundle-17-base", time: { created: Date.now() } },
      serverUrl: new URL("http://localhost:4096"),
      $: {} as never,
    })

    const beforeOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "README.md" },
    }

    await hooks["tool.execute.before"]?.(
      { tool: "read", sessionID: "bundle-17-base", callID: "bundle-17-base-call" },
      beforeOutput as never
    )

    expect(beforeOutput.args).toEqual({ filePath: "README.md" })
    expect(beforeOutput.metadata?.adaptiveStrictness).toBeTypeOf("string")

    const afterOutput: { output?: unknown; title?: string; metadata?: Record<string, unknown> } = {
      output: "ok",
    }

    await hooks["tool.execute.after"]?.(
      {
        tool: "read",
        sessionID: "bundle-17-base",
        callID: "bundle-17-base-call",
        args: { filePath: "README.md" },
      },
      afterOutput as never
    )

    expect(afterOutput.metadata?.verificationVerdict).toBeTypeOf("string")
    expect(afterOutput.metadata?.verificationReason).toBeTypeOf("string")
    expect(afterOutput.metadata?.normalizedOutput).toEqual(
      expect.objectContaining({
        status: expect.any(String),
        tool: "read",
      })
    )
  })

  it("treats new optional sdk payload fields as non-breaking while preserving approval block semantics", async () => {
    const hooks = await plugin({
      client: createClient({
        mode: "strict",
        approval: { enforce: true },
        strictControl: { recordOnly: false },
      }) as never,
      directory: "/tmp/swe-bundle-17-opt",
      worktree: "/tmp/swe-bundle-17-opt",
      project: { id: "proj-bundle-17-opt", worktree: "/tmp/swe-bundle-17-opt", time: { created: Date.now() } },
      serverUrl: new URL("http://localhost:4096"),
      $: {} as never,
    })

    const beforeOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
      args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
      metadata: { sdkVersion: "1.2.6", traceID: "trace-17" },
    }

    await hooks["tool.execute.before"]?.(
      {
        tool: "edit",
        sessionID: "bundle-17-opt",
        callID: "bundle-17-opt-call",
        sdkVersion: "1.2.6",
        traceID: "trace-17",
      } as never,
      beforeOutput as never
    )

    expect(beforeOutput.args).toBeUndefined()

    const afterOutput: { output?: unknown; title?: string; metadata?: Record<string, unknown> } = {
      metadata: { sdkVersion: "1.2.6", traceID: "trace-17" },
    }

    await hooks["tool.execute.after"]?.(
      {
        tool: "edit",
        sessionID: "bundle-17-opt",
        callID: "bundle-17-opt-call",
        args: { filePath: "src/a.ts", oldText: "a", newText: "b" },
        sdkVersion: "1.2.6",
        traceID: "trace-17",
      } as never,
      afterOutput as never
    )

    expect(String(afterOutput.output)).toContain("Approval required")
    expect(afterOutput.metadata?.approvalBlocked).toBe(true)
    expect(afterOutput.metadata?.approvalCallID).toBe("bundle-17-opt-call")
    expect(afterOutput.metadata?.governance).toEqual(
      expect.objectContaining({
        projectID: "proj-bundle-17-opt",
      })
    )
  })

  it("keeps required and optional governance tool args stable", async () => {
    const hooks = await plugin({
      client: createClient({
        mode: "strict",
        approval: { enforce: true },
        strictControl: { recordOnly: false },
      }) as never,
      directory: "/tmp/swe-bundle-17-tools",
      worktree: "/tmp/swe-bundle-17-tools",
      project: { id: "proj-bundle-17-tools", worktree: "/tmp/swe-bundle-17-tools", time: { created: Date.now() } },
      serverUrl: new URL("http://localhost:4096"),
      $: {} as never,
    })

    const context = {
      directory: "/tmp/swe-bundle-17-tools",
      sessionID: "bundle-17-tools",
      messageID: "msg-bundle-17-tools",
      agent: "build",
      worktree: "/tmp/swe-bundle-17-tools",
      abort: new AbortController().signal,
      metadata: () => undefined,
      ask: async () => undefined,
    }

    expect(hooks.tool).toBeDefined()
    const tools = hooks.tool!

    const approvalList = await tools.approval.execute({ action: "list" }, context)
    expect(typeof approvalList).toBe("string")

    const missingCallID = await tools.approval.execute({ action: "approve" }, context)
    expect(String(missingCallID)).toContain("callID is required")

    const delegated = await tools.delegate.execute({ prompt: "summarize current policy state" }, context)
    expect(String(delegated)).toContain("Delegation")

    const routePreview = await tools.route_task.execute({ prompt: "debug flaky tests" }, context)
    const parsed = JSON.parse(String(routePreview)) as Record<string, unknown>
    expect(parsed).toEqual(
      expect.objectContaining({
        agent: expect.any(String),
        category: expect.any(String),
      })
    )
  })
})
