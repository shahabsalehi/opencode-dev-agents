import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { describe, expect, it } from "vitest"
import {
  cleanupDelegations,
  formatDelegationList,
  listDelegations,
  readDelegation,
  saveDelegation,
  updateDelegation,
} from "../../../src/delegation/store.js"

async function createTmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "swe-del-store-"))
}

describe("delegation store extended", () => {
  it("saves, reads, updates, and lists records", async () => {
    const dir = await createTmp()
    const now = Date.now()

    await saveDelegation(dir, {
      id: "del_1",
      prompt: "do thing",
      agent: "build",
      createdAt: now,
      status: "pending",
    })

    const found = await readDelegation(dir, "del_1")
    expect(found?.id).toBe("del_1")

    const updated = await updateDelegation(dir, "del_1", { status: "completed", completedAt: now + 100 })
    expect(updated?.status).toBe("completed")

    const listed = await listDelegations(dir)
    expect(listed).toHaveLength(1)
    expect(formatDelegationList(listed)).toContain("del_1")

    await rm(dir, { recursive: true, force: true })
  })

  it("cleans up expired records", async () => {
    const dir = await createTmp()
    const now = Date.now()

    await saveDelegation(dir, {
      id: "old_one",
      prompt: "old",
      agent: "build",
      createdAt: now - 10_000,
      status: "pending",
    })

    await saveDelegation(dir, {
      id: "new_one",
      prompt: "new",
      agent: "build",
      createdAt: now,
      status: "pending",
    })

    const cleaned = await cleanupDelegations(dir, 1_000)
    const listed = await listDelegations(dir)

    expect(cleaned).toBe(1)
    expect(listed.map((r) => r.id)).toEqual(["new_one"])

    await rm(dir, { recursive: true, force: true })
  })

  it("returns null for missing records", async () => {
    const dir = await createTmp()
    const found = await readDelegation(dir, "missing")
    expect(found).toBeNull()
    await rm(dir, { recursive: true, force: true })
  })
})
