import { promises as fs } from "fs"
import { join, resolve } from "path"

export type DelegationStatus = "pending" | "running" | "completed" | "error" | "cancelled" | "timeout"

export type DelegationRecord = {
  id: string
  prompt: string
  agent: string
  createdAt: number
  status: DelegationStatus
  result?: string
  sessionID?: string
  completedAt?: number
}

export const DEFAULT_DELEGATION_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const DEFAULT_MAX_PROMPT_LENGTH = 10000
export const DEFAULT_MAX_RESULT_LENGTH = 50000
export const DEFAULT_MAX_AGENT_LENGTH = 100

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)
}

function validateRecord(record: DelegationRecord): DelegationRecord {
  if (!record.id || typeof record.id !== "string") {
    throw new Error("Invalid delegation id")
  }
  if (!record.prompt || record.prompt.length > DEFAULT_MAX_PROMPT_LENGTH) {
    throw new Error("Invalid delegation prompt")
  }
  if (!record.agent || record.agent.length > DEFAULT_MAX_AGENT_LENGTH) {
    throw new Error("Invalid delegation agent")
  }
  if (record.result && record.result.length > DEFAULT_MAX_RESULT_LENGTH) {
    throw new Error("Invalid delegation result")
  }

  return {
    ...record,
    id: sanitizeId(record.id),
    prompt: record.prompt.slice(0, DEFAULT_MAX_PROMPT_LENGTH),
    agent: record.agent.slice(0, DEFAULT_MAX_AGENT_LENGTH),
    result: record.result ? record.result.slice(0, DEFAULT_MAX_RESULT_LENGTH) : undefined,
    sessionID: record.sessionID,
    completedAt: record.completedAt
  }
}

function getStoreDir(baseDir: string): string {
  return resolve(baseDir, ".opencode", "delegations")
}

export async function saveDelegation(baseDir: string, record: DelegationRecord): Promise<void> {
  const dir = getStoreDir(baseDir)
  await fs.mkdir(dir, { recursive: true })
  const sanitized = validateRecord(record)
  const filePath = join(dir, `${sanitized.id}.json`)
  await fs.writeFile(filePath, JSON.stringify(sanitized, null, 2), "utf-8")
}

export async function readDelegation(baseDir: string, id: string): Promise<DelegationRecord | null> {
  const filePath = join(getStoreDir(baseDir), `${sanitizeId(id)}.json`)
  try {
    const content = await fs.readFile(filePath, "utf-8")
    return validateRecord(JSON.parse(content) as DelegationRecord)
  } catch {
    return null
  }
}

export async function updateDelegation(
  baseDir: string,
  id: string,
  update: Partial<DelegationRecord>
): Promise<DelegationRecord | null> {
  const record = await readDelegation(baseDir, id)
  if (!record) return null
  const next = { ...record, ...update }
  await saveDelegation(baseDir, next)
  return next
}

export async function listDelegations(baseDir: string): Promise<DelegationRecord[]> {
  const dir = getStoreDir(baseDir)
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const records: DelegationRecord[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue
    const record = await readDelegation(baseDir, entry.name.replace(/\.json$/, ""))
    if (record) records.push(record)
  }

  return records.sort((a, b) => b.createdAt - a.createdAt)
}

export async function cleanupDelegations(baseDir: string, ttlMs: number = DEFAULT_DELEGATION_TTL_MS): Promise<number> {
  const dir = getStoreDir(baseDir)
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const now = Date.now()
  let cleaned = 0

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue
    const record = await readDelegation(baseDir, entry.name.replace(/\.json$/, ""))
    if (!record) continue
    if (now - record.createdAt > ttlMs) {
      await fs.unlink(join(dir, entry.name))
      cleaned++
    }
  }

  return cleaned
}

export function formatDelegationList(records: DelegationRecord[]): string {
  if (records.length === 0) {
    return "No delegations found."
  }

  return records
    .map((record) => {
      const statusEmoji = record.status === "completed"
        ? "✅"
        : record.status === "running"
          ? "🏃"
        : record.status === "error"
          ? "❌"
          : record.status === "cancelled"
            ? "🛑"
            : record.status === "timeout"
              ? "⏱️"
          : "⏳"
      return `${statusEmoji} ${record.id} | ${record.agent} | ${record.status}${record.completedAt ? ` | done: ${new Date(record.completedAt).toISOString()}` : ""}`
    })
    .join("\n")
}
