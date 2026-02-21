import { describe, expect, it, vi } from "vitest"
import { createGovernanceHooks } from "../../../src/create-hooks.js"
import { RunLedger } from "../../../src/audit/run-ledger.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../../src/policy/defaults.js"

function createHooks(overrides?: {
  strictPolicy?: typeof DEFAULT_STRICT_CONTROL_POLICY
  approvals?: unknown[]
  enableChatMessagesTransform?: boolean
}) {
  return createGovernanceHooks({
    strictPolicy: overrides?.strictPolicy ?? { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: false },
    runLedger: new RunLedger(),
    directory: "/tmp/swe-hooks-ext",
    governanceMetadata: {
      worktree: "/tmp/swe-hooks-ext",
      projectID: "proj-hooks-ext",
      serverUrl: "http://localhost:4096",
    },
    approvalStore: {
      getPendingApprovals: () => overrides?.approvals ?? [],
    },
    client: {
      app: {
        log: vi.fn().mockResolvedValue({}),
      },
    },
    enableChatMessagesTransform: overrides?.enableChatMessagesTransform ?? true,
    enableTextCompleteHook: false,
  })
}

describe("create hooks extended", () => {
  it("adds command and agent defaults in config hook", async () => {
    const hooks = createHooks()
    const config = {} as never
    await hooks.config?.(config)
    expect(config.command["approval-list"]).toBeDefined()
    expect(config.agent["swe-sworm-guard"]).toBeDefined()
  })

  it("permission ask sets deny for blocked tool and ask for risky unknown tools", async () => {
    const hooks = createHooks({
      strictPolicy: {
        ...DEFAULT_STRICT_CONTROL_POLICY,
        recordOnly: false,
      },
    })

    const denyOutput = { status: "allow" as const }
    await hooks["permission.ask"]?.(
      {
        id: "p1",
        type: "bash",
        title: "run shell",
        sessionID: "ses-hx-1",
        messageID: "m1",
        metadata: { tool: "bash", args: { command: "git push origin main" } },
      } as never,
      denyOutput as never
    )
    expect(denyOutput.status).toBe("deny")

    const askOutput = { status: "allow" as const }
    await hooks["permission.ask"]?.(
      {
        id: "p2",
        type: "unknown",
        title: "unknown op",
        sessionID: "ses-hx-2",
        messageID: "m2",
        metadata: { toolName: "mysteryTool", args: { x: 1 } },
      } as never,
      askOutput as never
    )
    expect(askOutput.status).toBe("ask")
  })

  it("chat hooks inject notice, cap temperature, and inject headers", async () => {
    const hooks = createHooks({ approvals: [{ id: "a1" }] })

    const messageOutput = { message: {} as never, parts: [] as Array<{ type: string; text?: string }> }
    await hooks["chat.message"]?.({ sessionID: "ses-hx-3" }, messageOutput as never)
    expect(messageOutput.parts.length).toBe(1)

    const paramsOutput = { temperature: 0.9, topP: 1, topK: 40, options: {} }
    await hooks["chat.params"]?.(
      { sessionID: "ses-hx-3", agent: "build", model: {} as never, provider: {} as never, message: {} as never },
      paramsOutput
    )
    expect(paramsOutput.temperature).toBe(0.2)

    const headersOutput = { headers: {} as Record<string, string> }
    await hooks["chat.headers"]?.(
      { sessionID: "ses-hx-3", agent: "build", model: {} as never, provider: {} as never, message: {} as never },
      headersOutput
    )
    expect(headersOutput.headers["X-Governance-Project"]).toBe("proj-hooks-ext")
  })

  it("command/shell/transform paths execute under flag controls", async () => {
    const hooks = createHooks({ approvals: [{ id: "a1" }], enableChatMessagesTransform: false })

    const commandOutput = { parts: [] as Array<{ type: string; text?: string }> }
    await hooks["command.execute.before"]?.(
      { command: "status", sessionID: "ses-hx-4", arguments: "" },
      commandOutput as never
    )
    expect(commandOutput.parts.length).toBe(1)

    const shellOutput = { env: {} as Record<string, string> }
    await hooks["shell.env"]?.({ cwd: "/tmp" }, shellOutput)
    expect(shellOutput.env.SWE_SWORM_PROJECT_ID).toBe("proj-hooks-ext")

    const transformOutput = {
      messages: [
        {
          info: { role: "assistant" },
          parts: [{ type: "tool" }],
        },
      ],
    }
    await hooks["experimental.chat.messages.transform"]?.({} as Record<string, never>, transformOutput as never)
    expect(transformOutput.messages[0].parts.length).toBe(1)
  })
})
