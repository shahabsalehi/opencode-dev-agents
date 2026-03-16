import { promises as fs } from "fs"
import { join, resolve } from "path"

export type AuditEntry = {
  timestamp: string
  sessionID?: string
  callID?: string
  action: string
  tool?: string
  status?: "allow" | "deny" | "ask" | "error" | "info"
  details?: Record<string, unknown>
}

const MAX_DETAIL_LENGTH = 2000

function getAuditDir(baseDir: string): string {
  return resolve(baseDir, ".opencode", "audit")
}

function sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details) return undefined
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(details)) {
    if (key.toLowerCase().includes("token") || key.toLowerCase().includes("secret")) {
      sanitized[key] = "[REDACTED]"
      continue
    }
    const text = typeof value === "string" ? value : JSON.stringify(value)
    if (!text) continue
    sanitized[key] = text.slice(0, MAX_DETAIL_LENGTH)
  }
  return sanitized
}

export async function appendAuditEntry(baseDir: string, entry: AuditEntry): Promise<void> {
  const dir = getAuditDir(baseDir)
  await fs.mkdir(dir, { recursive: true })
  const filePath = join(dir, "audit.ndjson")
  const payload = {
    ...entry,
    details: sanitizeDetails(entry.details)
  }
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf-8")
}
