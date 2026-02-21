import { mkdtemp, rm, utimes } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { describe, expect, it } from "vitest"
import { cleanupThoughts, formatThoughtList, listThoughts, saveThought } from "../../../src/thoughts/store.js"

async function createTmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "swe-thought-store-"))
}

function thoughtsPath(baseDir: string): string {
  return join(baseDir, ".opencode", "thoughts")
}

describe("thoughts store extended", () => {
  it("saves and lists sanitized thoughts", async () => {
    const dir = await createTmp()
    const now = Date.now()

    await saveThought(dir, {
      id: "th_1",
      title: "Title<script>alert(1)</script>",
      content: "Body with <iframe>bad</iframe> javascript:payload",
      createdAt: now,
    })

    const list = await listThoughts(dir)
    expect(list).toHaveLength(1)
    expect(list[0].title).not.toContain("script")
    expect(list[0].content).not.toContain("javascript:")
    expect(formatThoughtList(list)).toContain("th_1")

    await rm(dir, { recursive: true, force: true })
  })

  it("cleans up expired thoughts", async () => {
    const dir = await createTmp()
    const now = Date.now()

    await saveThought(dir, {
      id: "th_old",
      title: "Old",
      content: "A",
      createdAt: now - 20_000,
    })
    await saveThought(dir, {
      id: "th_new",
      title: "New",
      content: "B",
      createdAt: now,
    })

    const oldFile = join(thoughtsPath(dir), "th_old.md")
    const newFile = join(thoughtsPath(dir), "th_new.md")
    await utimes(oldFile, new Date(now - 20_000), new Date(now - 20_000))
    await utimes(newFile, new Date(now), new Date(now))

    const cleaned = await cleanupThoughts(dir, 1)
    const list = await listThoughts(dir)

    expect(cleaned).toBeGreaterThanOrEqual(1)
    expect(list.length).toBeLessThanOrEqual(1)

    await rm(dir, { recursive: true, force: true })
  })
})
