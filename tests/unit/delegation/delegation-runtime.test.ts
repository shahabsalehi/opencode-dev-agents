import { afterEach, describe, expect, it } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { DelegationRuntime, buildDelegationRecord } from "../../../src/delegation/runtime.js"
import { readDelegation, saveDelegation } from "../../../src/delegation/store.js"

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (!dir) continue
    await rm(dir, { recursive: true, force: true })
  }
})

describe("delegation runtime helpers", () => {
  it("builds a pending delegation record", () => {
    const record = buildDelegationRecord({
      id: "del_123",
      prompt: "Investigate issue",
      agent: "explore",
    })

    expect(record.id).toBe("del_123")
    expect(record.status).toBe("pending")
    expect(record.createdAt).toBeGreaterThan(0)
  })

  it("notifies parent session when delegated session completes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swarm-runtime-"))
    tempDirs.push(directory)

    const promptCalls: Array<{ sessionID: string; text: string; noReply?: boolean }> = []
    let nextSessionID = 0

    const runtime = new DelegationRuntime(
      {
        session: {
          async create() {
            nextSessionID++
            return { data: { id: `child-${nextSessionID}` } }
          },
          async prompt(args) {
            promptCalls.push({
              sessionID: args.path.id,
              text: args.body.parts.map((part) => part.text).join("\n"),
              noReply: args.body.noReply,
            })
            return {}
          },
          async messages(args) {
            if (args.path.id !== "child-1") return { data: [] }
            return {
              data: [
                {
                  info: { role: "assistant" },
                  parts: [{ type: "text", text: "result from delegated task" }],
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

    await saveDelegation(directory, buildDelegationRecord({ id: "del_1", prompt: "Investigate", agent: "explore" }))

    await runtime.start({
      delegationID: "del_1",
      prompt: "Investigate",
      agent: "explore",
      parentSessionID: "parent-1",
      parentAgent: "build",
    })

    expect(runtime.hasPendingForParent("parent-1")).toBe(true)
    expect(runtime.getActiveCountForParent("parent-1")).toBe(1)

    await runtime.handleSessionIdle("child-1")

    expect(runtime.hasPendingForParent("parent-1")).toBe(false)
    expect(runtime.getActiveCountForParent("parent-1")).toBe(0)

    const record = await readDelegation(directory, "del_1")
    expect(record?.status).toBe("completed")
    expect(record?.result).toContain("result from delegated task")

    const parentNotifications = promptCalls.filter((call) => call.sessionID === "parent-1")
    expect(parentNotifications).toHaveLength(1)
    expect(parentNotifications[0].text).toContain("<task-notification>")
    expect(parentNotifications[0].text).toContain("All delegations complete")
    expect(parentNotifications[0].noReply).toBe(false)
  })

  it("keeps parent notification noReply=true while other delegations are active", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swarm-runtime-"))
    tempDirs.push(directory)

    const promptCalls: Array<{ sessionID: string; text: string; noReply?: boolean }> = []
    let nextSessionID = 0

    const runtime = new DelegationRuntime(
      {
        session: {
          async create() {
            nextSessionID++
            return { data: { id: `child-${nextSessionID}` } }
          },
          async prompt(args) {
            promptCalls.push({
              sessionID: args.path.id,
              text: args.body.parts.map((part) => part.text).join("\n"),
              noReply: args.body.noReply,
            })
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

    await saveDelegation(directory, buildDelegationRecord({ id: "del_1", prompt: "One", agent: "explore" }))
    await saveDelegation(directory, buildDelegationRecord({ id: "del_2", prompt: "Two", agent: "explore" }))

    await runtime.start({ delegationID: "del_1", prompt: "One", agent: "explore", parentSessionID: "parent-1", parentAgent: "build" })
    await runtime.start({ delegationID: "del_2", prompt: "Two", agent: "explore", parentSessionID: "parent-1", parentAgent: "build" })

    expect(runtime.getActiveCountForParent("parent-1")).toBe(2)

    await runtime.handleSessionIdle("child-1")

    expect(runtime.getActiveCountForParent("parent-1")).toBe(1)

    const parentNotifications = promptCalls.filter((call) => call.sessionID === "parent-1")
    expect(parentNotifications).toHaveLength(1)
    expect(parentNotifications[0].text).toContain("still running")
    expect(parentNotifications[0].noReply).toBe(true)
  })
})
