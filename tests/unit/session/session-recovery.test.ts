import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { describe, expect, it } from "vitest"
import { RunLedger } from "../../../src/audit/run-ledger.js"
import { listDelegations, saveDelegation } from "../../../src/delegation/store.js"
import { reconcileOrphanDelegations, restoreRunLedgerSnapshot, saveRunLedgerSnapshot } from "../../../src/session/recovery.js"

async function createTmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "swe-session-recovery-"))
}

describe("session recovery", () => {
  it("saves and restores run ledger snapshots", async () => {
    const dir = await createTmp()
    const ledger = new RunLedger()
    ledger.recordToolCall("s1")
    ledger.recordMutation("s1")

    await saveRunLedgerSnapshot(dir, ledger)

    const loaded = new RunLedger()
    const restoredCount = await restoreRunLedgerSnapshot(dir, loaded)

    expect(restoredCount).toBe(1)
    expect(loaded.get("s1").toolCalls).toBe(1)
    expect(loaded.get("s1").filesModified).toBe(1)

    await rm(dir, { recursive: true, force: true })
  })

  it("reconciles stale pending/running delegations", async () => {
    const dir = await createTmp()
    const now = Date.now()

    await saveDelegation(dir, {
      id: "old-running",
      prompt: "p",
      agent: "build",
      createdAt: now - 100_000,
      status: "running",
    })
    await saveDelegation(dir, {
      id: "new-pending",
      prompt: "p2",
      agent: "build",
      createdAt: now,
      status: "pending",
    })

    const cancelled = await reconcileOrphanDelegations(dir, 1_000)
    const records = await listDelegations(dir)

    expect(cancelled).toBe(1)
    const old = records.find((item) => item.id === "old-running")
    const fresh = records.find((item) => item.id === "new-pending")
    expect(old?.status).toBe("cancelled")
    expect(fresh?.status).toBe("pending")

    await rm(dir, { recursive: true, force: true })
  })
})
