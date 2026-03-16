import { promises as fs } from "fs"
import { join, resolve } from "path"

export type ThoughtRecord = {
  id: string
  title: string
  content: string
  createdAt: number
}

export const DEFAULT_THOUGHT_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const DEFAULT_MAX_TITLE_LENGTH = 200
export const DEFAULT_MAX_CONTENT_LENGTH = 50000

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)
}

function sanitizeText(text: string, maxLength: number): string {
  return text
    .replace(/<\/?script[^>]*>/gi, "")
    .replace(/<\/?iframe[^>]*>/gi, "")
    .replace(/javascript:/gi, "")
    .slice(0, maxLength)
}

function validateThought(record: ThoughtRecord): ThoughtRecord {
  if (!record.id || typeof record.id !== "string") {
    throw new Error("Invalid thought id")
  }
  if (!record.title || record.title.length > DEFAULT_MAX_TITLE_LENGTH) {
    throw new Error("Invalid thought title")
  }
  if (!record.content || record.content.length > DEFAULT_MAX_CONTENT_LENGTH) {
    throw new Error("Invalid thought content")
  }

  return {
    ...record,
    id: sanitizeId(record.id),
    title: sanitizeText(record.title, DEFAULT_MAX_TITLE_LENGTH),
    content: sanitizeText(record.content, DEFAULT_MAX_CONTENT_LENGTH)
  }
}

function getThoughtsDir(baseDir: string): string {
  return resolve(baseDir, ".opencode", "thoughts")
}

export async function saveThought(baseDir: string, record: ThoughtRecord): Promise<void> {
  const dir = getThoughtsDir(baseDir)
  await fs.mkdir(dir, { recursive: true })
  const sanitized = validateThought(record)
  const filePath = join(dir, `${sanitized.id}.md`)
  const body = `# ${sanitized.title}\n\n${sanitized.content}\n\n---\nCreated: ${new Date(sanitized.createdAt).toISOString()}\n`
  await fs.writeFile(filePath, body, "utf-8")
}

export async function listThoughts(baseDir: string): Promise<ThoughtRecord[]> {
  const dir = getThoughtsDir(baseDir)
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const records: ThoughtRecord[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue
    const filePath = join(dir, entry.name)
    const content = await fs.readFile(filePath, "utf-8")
    const titleLine = content.split("\n")[0] || ""
    const title = titleLine.replace(/^#\s*/, "") || entry.name
    const createdAt = await fs.stat(filePath).then((stat) => stat.mtimeMs)
    records.push({
      id: entry.name.replace(/\.md$/, ""),
      title: sanitizeText(title, DEFAULT_MAX_TITLE_LENGTH),
      content,
      createdAt
    })
  }

  return records.sort((a, b) => b.createdAt - a.createdAt)
}

export async function cleanupThoughts(baseDir: string, ttlMs: number = DEFAULT_THOUGHT_TTL_MS): Promise<number> {
  const dir = getThoughtsDir(baseDir)
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const now = Date.now()
  let cleaned = 0

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue
    const filePath = join(dir, entry.name)
    const stat = await fs.stat(filePath)
    if (now - stat.mtimeMs > ttlMs) {
      await fs.unlink(filePath)
      cleaned++
    }
  }

  return cleaned
}

export function formatThoughtList(records: ThoughtRecord[]): string {
  if (records.length === 0) {
    return "No thoughts logged."
  }

  return records
    .map((record) => `- ${record.id} | ${record.title}`)
    .join("\n")
}
