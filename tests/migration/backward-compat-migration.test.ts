import { mkdtemp, mkdir, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { describe, expect, it, vi } from "vitest"
import { createPluginState } from "../../src/create-plugin-state.js"
import { listDelegations } from "../../src/delegation/store.js"
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
      agents: vi.fn().mockResolvedValue({ data: [{ name: "build" }, { name: "research" }] }),
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

async function runGovernanceOutcome(directory: string): Promise<{ blocked: boolean; output: string }> {
  const hooks = await plugin({
    client: createClient({
      mode: "strict",
      approval: { enforce: true },
      strictControl: { recordOnly: false },
      compatibility: { enableDelegationRuntime: false },
    }) as never,
    directory,
    worktree: directory,
    project: { id: "proj-bundle-20", worktree: directory, time: { created: Date.now() } },
    serverUrl: new URL("http://localhost:4096"),
    $: {} as never,
  })

  const beforeOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> } = {
    args: { filePath: "src/migrate.ts", oldText: "a", newText: "b" },
  }

  await hooks["tool.execute.before"]?.(
    { tool: "edit", sessionID: "bundle-20-replay", callID: "bundle-20-call" },
    beforeOutput as never
  )

  return {
    blocked: beforeOutput.args === undefined,
    output: String(beforeOutput.output ?? ""),
  }
}

describe("backward compatibility migration", () => {
  it("loads legacy persisted state, reconciles stale delegations, and preserves governance outcomes", async () => {
    const legacyDir = await mkdtemp(join(tmpdir(), "swe-bundle-20-legacy-"))
    const cleanDir = await mkdtemp(join(tmpdir(), "swe-bundle-20-clean-"))

    try {
      await mkdir(join(legacyDir, ".opencode", "session"), { recursive: true })
      await mkdir(join(legacyDir, ".opencode", "delegations"), { recursive: true })
      await mkdir(join(legacyDir, ".opencode", "thoughts"), { recursive: true })

      await writeFile(
        join(legacyDir, ".opencode", "session", "run-ledger.json"),
        JSON.stringify(
          {
            sessions: [
              {
                sessionID: "legacy-session",
                startedAt: Date.now() - 100000,
                lastUpdatedAt: Date.now() - 90000,
                toolCalls: 5,
                filesModified: 2,
                policy: {
                  allow: 2,
                  deny: 1,
                  needsApproval: 2,
                  byRisk: { low: 1, medium: 1, high: 1, critical: 0 },
                },
                legacyVersion: "v0",
              },
            ],
            updatedAt: Date.now() - 80000,
          },
          null,
          2
        ),
        "utf-8"
      )

      await writeFile(
        join(legacyDir, ".opencode", "delegations", "legacy-running.json"),
        JSON.stringify(
          {
            id: "legacy-running",
            prompt: "legacy prompt",
            agent: "build",
            createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
            status: "running",
            result: "legacy",
          },
          null,
          2
        ),
        "utf-8"
      )

      await writeFile(
        join(legacyDir, ".opencode", "thoughts", "legacy-plan.md"),
        "# plan: legacy migration\n\nlegacy thought body\n",
        "utf-8"
      )

      const state = await createPluginState({
        client: createClient({
          mode: "strict",
          approval: { enforce: true },
          strictControl: { recordOnly: false },
          compatibility: { enableDelegationRuntime: false },
        }) as never,
        directory: legacyDir,
        worktree: legacyDir,
        project: { id: "proj-bundle-20", worktree: legacyDir, time: { created: Date.now() } } as never,
        serverUrl: new URL("http://localhost:4096"),
      })

      expect(state.runLedger.get("legacy-session").toolCalls).toBe(5)

      const delegations = await listDelegations(legacyDir)
      const reconciled = delegations.find((item) => item.id === "legacy-running")
      expect(reconciled).toBeUndefined()

      const migratedOutcome = await runGovernanceOutcome(legacyDir)
      const cleanOutcome = await runGovernanceOutcome(cleanDir)

      expect(migratedOutcome.blocked).toBe(true)
      expect(cleanOutcome.blocked).toBe(true)
      expect(migratedOutcome.output).toContain("Approval required")
      expect(cleanOutcome.output).toContain("Approval required")
    } finally {
      await rm(legacyDir, { recursive: true, force: true })
      await rm(cleanDir, { recursive: true, force: true })
    }
  })
})
