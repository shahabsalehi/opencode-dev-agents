import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { describe, expect, it, vi } from "vitest"
import { RunLedger } from "../../src/audit/run-ledger.js"
import plugin from "../../src/index.js"
import { listDelegations } from "../../src/delegation/store.js"
import { restoreRunLedgerSnapshot } from "../../src/session/recovery.js"
import { listThoughts } from "../../src/thoughts/store.js"

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

describe("sqlite durability (file-backed persistence)", () => {
  it("recovers durable delegation/thought state and run-ledger after crash-like interruption", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swe-bundle-18-"))

    try {
      const hooks = await plugin({
        client: createClient({
          mode: "strict",
          approval: { enforce: true },
          strictControl: { recordOnly: false },
        }) as never,
        directory: dir,
        worktree: dir,
        project: { id: "proj-bundle-18", worktree: dir, time: { created: Date.now() } },
        serverUrl: new URL("http://localhost:4096"),
        $: {} as never,
      })

      const context = {
        directory: dir,
        sessionID: "bundle-18-session",
        messageID: "msg-bundle-18",
        agent: "build",
        worktree: dir,
        abort: new AbortController().signal,
        metadata: () => undefined,
        ask: async () => undefined,
      }

      expect(hooks.tool).toBeDefined()
      const tools = hooks.tool!

      await tools.delegate.execute({ prompt: "persist this delegation", agent: "build" }, context)
      await tools.thought_log.execute({ title: "plan: durability", content: "verify restart integrity" }, context)

      const beforeOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
        args: { filePath: "src/durable.ts", oldText: "a", newText: "b" },
      }

      await hooks["tool.execute.before"]?.(
        { tool: "edit", sessionID: "bundle-18-session", callID: "bundle-18-call" },
        beforeOutput as never
      )

      const afterOutput: { output?: unknown; title?: string; metadata?: Record<string, unknown> } = {}
      await hooks["tool.execute.after"]?.(
        {
          tool: "edit",
          sessionID: "bundle-18-session",
          callID: "bundle-18-call",
          args: { filePath: "src/durable.ts", oldText: "a", newText: "b" },
        },
        afterOutput as never
      )

      expect(afterOutput.metadata?.approvalBlocked).toBe(true)

      const checkpointOutput: { output?: unknown; title?: string; metadata?: Record<string, unknown> } = {
        output: "checkpoint",
      }
      await hooks["tool.execute.after"]?.(
        {
          tool: "read",
          sessionID: "bundle-18-session",
          callID: "bundle-18-checkpoint",
          args: { filePath: "README.md" },
        },
        checkpointOutput as never
      )

      const snapshotPath = join(dir, ".opencode", "session", "run-ledger.json")
      const snapshotText = await readFile(snapshotPath, "utf-8")
      const snapshot = JSON.parse(snapshotText) as { sessions?: unknown[] }
      expect(Array.isArray(snapshot.sessions)).toBe(true)
      expect((snapshot.sessions ?? []).length).toBeGreaterThanOrEqual(1)

      await writeFile(join(dir, ".opencode", "delegations", "interrupted.json"), "{\n  \"id\": \"partial\"", "utf-8")

      const restoredLedger = new RunLedger()
      const restoredSessions = await restoreRunLedgerSnapshot(dir, restoredLedger)
      const recoveredDelegations = await listDelegations(dir)
      const recoveredThoughts = await listThoughts(dir)

      expect(restoredSessions).toBeGreaterThanOrEqual(1)
      expect(restoredLedger.get("bundle-18-session").toolCalls).toBeGreaterThan(0)
      expect(restoredLedger.get("bundle-18-session").policy.needsApproval).toBeGreaterThan(0)

      expect(recoveredDelegations.some((item) => item.prompt === "persist this delegation")).toBe(true)
      expect(recoveredDelegations.some((item) => item.id === "interrupted")).toBe(false)
      expect(recoveredDelegations).toHaveLength(1)

      expect(recoveredThoughts.some((item) => item.title === "plan: durability")).toBe(true)
      expect(recoveredThoughts.some((item) => item.content.includes("verify restart integrity"))).toBe(true)

      const restarted = await plugin({
        client: createClient({
          mode: "strict",
          approval: { enforce: true },
          strictControl: { recordOnly: false },
        }) as never,
        directory: dir,
        worktree: dir,
        project: { id: "proj-bundle-18", worktree: dir, time: { created: Date.now() } },
        serverUrl: new URL("http://localhost:4096"),
        $: {} as never,
      })
      expect(restarted.tool).toBeDefined()
      const restartedTools = restarted.tool!
      const delegationList = await restartedTools.delegation_list.execute({}, context)
      const thoughtList = await restartedTools.thought_list.execute({}, context)
      expect(String(delegationList)).not.toContain("No delegations found")
      expect(String(delegationList)).toContain("| build |")
      expect(String(thoughtList)).toContain("plan: durability")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
