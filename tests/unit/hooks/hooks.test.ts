import { describe, expect, it, vi } from "vitest"
import { createGovernanceHooks } from "../../../src/create-hooks.js"
import { RunLedger } from "../../../src/audit/run-ledger.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../../src/policy/defaults.js"
import type { Part } from "@opencode-ai/sdk"

function createMockInput(overrides: Record<string, unknown> = {}) {
  return {
    strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, enabled: true },
    runLedger: new RunLedger(),
    directory: "/tmp/test",
    governanceMetadata: { worktree: "/tmp", projectID: "test-project", serverUrl: "http://test" },
    approvalStore: { getPendingApprovals: (_sessionID: string) => [] as unknown[] },
    client: { app: { log: vi.fn().mockResolvedValue({}) } },
    enableChatMessagesTransform: true,
    enableTextCompleteHook: false,
    ...overrides,
  }
}

describe("createGovernanceHooks", () => {
  describe("chat.headers", () => {
    it("injects X-Governance-Project and X-Governance-Strict headers", async () => {
      const input = createMockInput()
      const hooks = createGovernanceHooks(input)
      const output = { headers: {} as Record<string, string> }

      await hooks["chat.headers"]!(
        { sessionID: "s1", agent: "build", model: {} as never, provider: {} as never, message: {} as never },
        output
      )

      expect(output.headers["X-Governance-Project"]).toBe("test-project")
      expect(output.headers["X-Governance-Strict"]).toBe("true")
    })

    it("does not include sensitive paths in headers", async () => {
      const input = createMockInput()
      const hooks = createGovernanceHooks(input)
      const output = { headers: {} as Record<string, string> }

      await hooks["chat.headers"]!(
        { sessionID: "s1", agent: "build", model: {} as never, provider: {} as never, message: {} as never },
        output
      )

      const headerValues = Object.values(output.headers).join(" ")
      expect(headerValues).not.toContain("/tmp")
      expect(headerValues).not.toContain("http://test")
    })

    it("handles errors gracefully via client.app.log", async () => {
      const mockLog = vi.fn().mockResolvedValue({})
      const input = createMockInput({
        governanceMetadata: null,
        client: { app: { log: mockLog } },
      })
      const hooks = createGovernanceHooks(input)
      const output = { headers: {} as Record<string, string> }

      await hooks["chat.headers"]!(
        { sessionID: "s1", agent: "build", model: {} as never, provider: {} as never, message: {} as never },
        output
      )

      expect(mockLog).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            level: "error",
            message: "Chat headers hook error",
          }),
        })
      )
    })
  })

  describe("chat.message", () => {
    it("injects governance notice when approvals are pending", async () => {
      const input = createMockInput({
        approvalStore: { getPendingApprovals: () => [{ id: "a1" }, { id: "a2" }] },
      })
      const hooks = createGovernanceHooks(input)
      const parts: Part[] = []

      await hooks["chat.message"]!(
        { sessionID: "s1" },
        { message: {} as never, parts }
      )

      expect(parts).toHaveLength(1)
      expect((parts[0] as { text: string }).text).toContain("2 approval(s) pending")
    })

    it("skips injection when no approvals pending", async () => {
      const input = createMockInput()
      const hooks = createGovernanceHooks(input)
      const parts: Part[] = []

      await hooks["chat.message"]!(
        { sessionID: "s1" },
        { message: {} as never, parts }
      )

      expect(parts).toHaveLength(0)
    })
  })

  describe("chat.params", () => {
    it("caps temperature at 0.2 when strict policy enabled", async () => {
      const input = createMockInput()
      const hooks = createGovernanceHooks(input)
      const output = { temperature: 0.8, topP: 1, topK: 0, options: {} }

      await hooks["chat.params"]!(
        { sessionID: "s1", agent: "build", model: {} as never, provider: {} as never, message: {} as never },
        output
      )

      expect(output.temperature).toBe(0.2)
    })

    it("does not cap temperature when strict policy disabled", async () => {
      const input = createMockInput({
        strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, enabled: false },
      })
      const hooks = createGovernanceHooks(input)
      const output = { temperature: 0.8, topP: 1, topK: 0, options: {} }

      await hooks["chat.params"]!(
        { sessionID: "s1", agent: "build", model: {} as never, provider: {} as never, message: {} as never },
        output
      )

      expect(output.temperature).toBe(0.8)
    })

    it("leaves temperature alone when already at or below 0.2", async () => {
      const input = createMockInput()
      const hooks = createGovernanceHooks(input)
      const output = { temperature: 0.1, topP: 1, topK: 0, options: {} }

      await hooks["chat.params"]!(
        { sessionID: "s1", agent: "build", model: {} as never, provider: {} as never, message: {} as never },
        output
      )

      expect(output.temperature).toBe(0.1)
    })
  })
})

describe("command/shell/transform hooks", () => {
  it("command.execute.before pushes governance notice when approvals are pending", async () => {
    const hooks = createGovernanceHooks(
      createMockInput({
        approvalStore: { getPendingApprovals: () => [{ id: "a1" }, { id: "a2" }] },
      })
    )
    const output = { parts: [] as Part[] }

    await hooks["command.execute.before"]?.(
      { command: "status", sessionID: "s1", arguments: "" },
      output
    )

    expect(output.parts).toHaveLength(1)
    expect(JSON.stringify(output.parts[0])).toContain("approval(s) pending")
  })

  it("shell.env injects governance env values", async () => {
    const hooks = createGovernanceHooks(createMockInput())
    const output = { env: { PATH: "/usr/bin" } as Record<string, string> }

    await hooks["shell.env"]?.({ cwd: "/tmp" }, output)

    expect(output.env.PATH).toBe("/usr/bin")
    expect(output.env.SWE_SWORM_STRICT).toBe("true")
    expect(output.env.SWE_SWORM_PROJECT_ID).toBe("test-project")
  })

  it("experimental.chat.messages.transform annotates assistant tool messages", async () => {
    const hooks = createGovernanceHooks(createMockInput())
    const output = {
      messages: [
        {
          info: { role: "assistant" } as never,
          parts: [{ type: "tool" } as never],
        },
      ],
    }

    await hooks["experimental.chat.messages.transform"]?.({} as Record<string, never>, output)

    expect(output.messages[0].parts).toHaveLength(2)
    expect(JSON.stringify(output.messages[0].parts[1])).toContain("governance")
  })
})
