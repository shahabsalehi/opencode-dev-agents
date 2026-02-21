import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { afterEach, describe, expect, it } from "vitest"
import { DelegationRuntime, buildDelegationRecord } from "../../src/delegation/runtime.js"
import { listDelegations, readDelegation, saveDelegation, updateDelegation } from "../../src/delegation/store.js"

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (!dir) continue
    await rm(dir, { recursive: true, force: true })
  }
})

describe("file-backed contention and concurrency", () => {
  it("retries transient timeout contention and preserves consistent final delegation state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swe-bundle-19-"))
    tempDirs.push(directory)

    await saveDelegation(directory, buildDelegationRecord({ id: "del-a", prompt: "alpha", agent: "explore" }))
    await saveDelegation(directory, buildDelegationRecord({ id: "del-b", prompt: "beta", agent: "explore" }))

    const createAttemptsByParent = new Map<string, number>()
    const promptAttemptsBySession = new Map<string, number>()
    let nextSessionID = 0

    const runtime = new DelegationRuntime(
      {
        session: {
          async create(args) {
            const parent = args.body.parentID
            const attempt = (createAttemptsByParent.get(parent) ?? 0) + 1
            createAttemptsByParent.set(parent, attempt)

            if (attempt === 1) {
              throw new Error("network timeout while creating delegated session")
            }

            nextSessionID += 1
            return { data: { id: `child-${nextSessionID}` } }
          },
          async prompt(args) {
            const sessionID = args.path.id
            const attempt = (promptAttemptsBySession.get(sessionID) ?? 0) + 1
            promptAttemptsBySession.set(sessionID, attempt)
            const text = args.body.parts.map((part) => part.text).join("\n")
            const isDelegationStart = !text.includes("<task-notification>")
            if (isDelegationStart && attempt === 1) {
              throw new Error("socket timeout while delivering prompt")
            }
            return {}
          },
          async messages(args) {
            return {
              data: [
                {
                  info: { role: "assistant" },
                  parts: [{ type: "text", text: `completed ${args.path.id}` }],
                },
              ],
            }
          },
        },
        app: {
          async log() {
            return {}
          },
        },
      },
      directory
    )

    const startedAt = Date.now()
    const [startedA, startedB] = await Promise.all([
      runtime.start({
        delegationID: "del-a",
        prompt: "alpha",
        agent: "explore",
        parentSessionID: "parent-a",
        parentAgent: "build",
      }),
      runtime.start({
        delegationID: "del-b",
        prompt: "beta",
        agent: "explore",
        parentSessionID: "parent-b",
        parentAgent: "build",
      }),
    ])
    const elapsedMs = Date.now() - startedAt

    expect(startedA.sessionID).not.toBe(startedB.sessionID)
    expect(createAttemptsByParent.get("parent-a")).toBe(2)
    expect(createAttemptsByParent.get("parent-b")).toBe(2)
    expect((promptAttemptsBySession.get(startedA.sessionID) ?? 0)).toBeGreaterThanOrEqual(2)
    expect((promptAttemptsBySession.get(startedB.sessionID) ?? 0)).toBeGreaterThanOrEqual(2)
    expect(elapsedMs).toBeGreaterThanOrEqual(200)

    await Promise.all([
      updateDelegation(directory, "del-a", { status: "running", result: "race-update-1" }),
      updateDelegation(directory, "del-a", { status: "running", result: "race-update-2" }),
    ])

    const racedRecord = await readDelegation(directory, "del-a")
    expect(racedRecord?.status).toBe("running")
    expect(["race-update-1", "race-update-2"]).toContain(racedRecord?.result)

    await Promise.all([
      runtime.handleSessionIdle(startedA.sessionID),
      runtime.handleSessionIdle(startedB.sessionID),
    ])

    const records = await listDelegations(directory)
    expect(records).toHaveLength(2)
    expect(records.every((item) => item.status === "completed")).toBe(true)
    expect(records.every((item) => item.result?.startsWith("completed child-"))).toBe(true)
  })

  it("completes concurrent shared-parent delegations without deadlock", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swe-bundle-19-deadlock-"))
    tempDirs.push(directory)

    await saveDelegation(directory, buildDelegationRecord({ id: "del-1", prompt: "one", agent: "explore" }))
    await saveDelegation(directory, buildDelegationRecord({ id: "del-2", prompt: "two", agent: "explore" }))

    let nextSessionID = 0
    const runtime = new DelegationRuntime(
      {
        session: {
          async create() {
            nextSessionID += 1
            return { data: { id: `child-shared-${nextSessionID}` } }
          },
          async prompt() {
            return {}
          },
          async messages(args) {
            return {
              data: [
                {
                  info: { role: "assistant" },
                  parts: [{ type: "text", text: `done ${args.path.id}` }],
                },
              ],
            }
          },
        },
        app: {
          async log() {
            return {}
          },
        },
      },
      directory
    )

    const [first, second] = await Promise.all([
      runtime.start({
        delegationID: "del-1",
        prompt: "one",
        agent: "explore",
        parentSessionID: "parent-shared",
        parentAgent: "build",
      }),
      runtime.start({
        delegationID: "del-2",
        prompt: "two",
        agent: "explore",
        parentSessionID: "parent-shared",
        parentAgent: "build",
      }),
    ])

    expect(runtime.getActiveCountForParent("parent-shared")).toBe(2)

    await Promise.race([
      Promise.all([
        runtime.handleSessionIdle(first.sessionID),
        runtime.handleSessionIdle(second.sessionID),
      ]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("deadlock timeout")), 1000)),
    ])

    expect(runtime.getActiveCountForParent("parent-shared")).toBe(0)
    expect(runtime.hasPendingForParent("parent-shared")).toBe(false)

    const records = await listDelegations(directory)
    expect(records).toHaveLength(2)
    expect(records.every((item) => item.status === "completed")).toBe(true)
  })
})
