import { promises as fs } from "fs"
import { join } from "path"
import type { RunLedger } from "../audit/run-ledger.js"
import { listDelegations, updateDelegation } from "../delegation/store.js"

type RunLedgerSnapshot = {
  sessions: ReturnType<RunLedger["toJSON"]>
  updatedAt: number
}

const SNAPSHOT_DIR = ".opencode/session"
const SNAPSHOT_FILE = "run-ledger.json"

function snapshotPath(baseDir: string): string {
  return join(baseDir, SNAPSHOT_DIR, SNAPSHOT_FILE)
}

export async function saveRunLedgerSnapshot(baseDir: string, runLedger: RunLedger): Promise<void> {
  const path = snapshotPath(baseDir)
  await fs.mkdir(join(baseDir, SNAPSHOT_DIR), { recursive: true })
  const payload: RunLedgerSnapshot = {
    sessions: runLedger.toJSON(),
    updatedAt: Date.now(),
  }
  await fs.writeFile(path, JSON.stringify(payload, null, 2), "utf-8")
}

export async function restoreRunLedgerSnapshot(baseDir: string, runLedger: RunLedger): Promise<number> {
  const path = snapshotPath(baseDir)
  try {
    const content = await fs.readFile(path, "utf-8")
    const parsed = JSON.parse(content) as RunLedgerSnapshot
    runLedger.load(parsed.sessions)
    return parsed.sessions.length
  } catch {
    return 0
  }
}

export async function reconcileOrphanDelegations(baseDir: string, staleMs: number): Promise<number> {
  const records = await listDelegations(baseDir)
  const now = Date.now()
  let cancelled = 0

  for (const record of records) {
    const age = now - record.createdAt
    const isActive = record.status === "pending" || record.status === "running"
    if (isActive && age > staleMs) {
      await updateDelegation(baseDir, record.id, {
        status: "cancelled",
        result: "Recovered orphaned delegation after stale timeout",
        completedAt: now,
      })
      cancelled += 1
    }
  }

  return cancelled
}
