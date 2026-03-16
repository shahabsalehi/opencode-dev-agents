import { describe, expect, it } from "vitest"
import { BoundedDelegationRuntime, type DelegationRuntimeLike } from "../../src/orchestrator/delegation.js"

type DelegationStatus = "pending" | "running" | "completed" | "timeout"

class StressRuntime implements DelegationRuntimeLike {
  private readonly activeByParent = new Map<string, number>()
  private readonly records = new Map<string, { parentSessionID: string; sessionID: string; status: DelegationStatus }>()
  private counter = 0

  async start(input: {
    delegationID: string
    prompt: string
    agent: string
    parentSessionID: string
    parentAgent: string
  }): Promise<{ delegationID: string; sessionID: string }> {
    this.counter += 1
    const sessionID = `child-${this.counter}`
    const active = this.activeByParent.get(input.parentSessionID) ?? 0
    this.activeByParent.set(input.parentSessionID, active + 1)
    this.records.set(input.delegationID, {
      parentSessionID: input.parentSessionID,
      sessionID,
      status: "running",
    })
    return { delegationID: input.delegationID, sessionID }
  }

  hasPendingForParent(parentSessionID: string): boolean {
    for (const record of this.records.values()) {
      if (record.parentSessionID === parentSessionID && (record.status === "pending" || record.status === "running")) {
        return true
      }
    }
    return false
  }

  getActiveCountForParent(parentSessionID: string): number {
    return this.activeByParent.get(parentSessionID) ?? 0
  }

  async handleSessionIdle(): Promise<void> {
    return
  }

  async handleSessionError(): Promise<void> {
    return
  }

  setPending(delegationID: string): void {
    const record = this.records.get(delegationID)
    if (!record) return
    record.status = "pending"
  }

  complete(delegationID: string): void {
    const record = this.records.get(delegationID)
    if (!record) return
    if (record.status === "running" || record.status === "pending") {
      const active = this.activeByParent.get(record.parentSessionID) ?? 0
      this.activeByParent.set(record.parentSessionID, Math.max(0, active - 1))
    }
    record.status = "completed"
  }

  timeout(delegationID: string): void {
    const record = this.records.get(delegationID)
    if (!record) return
    if (record.status === "running" || record.status === "pending") {
      const active = this.activeByParent.get(record.parentSessionID) ?? 0
      this.activeByParent.set(record.parentSessionID, Math.max(0, active - 1))
    }
    record.status = "timeout"
  }

  summary(parentSessionID: string): { pending: number; running: number; completed: number; timeout: number } {
    let pending = 0
    let running = 0
    let completed = 0
    let timeout = 0
    for (const record of this.records.values()) {
      if (record.parentSessionID !== parentSessionID) continue
      if (record.status === "pending") pending += 1
      if (record.status === "running") running += 1
      if (record.status === "completed") completed += 1
      if (record.status === "timeout") timeout += 1
    }
    return { pending, running, completed, timeout }
  }
}

describe("delegation stress matrix", () => {
  it("enforces maxParallelDelegations and deterministic parent block/unblock", async () => {
    const runtime = new StressRuntime()
    const bounded = new BoundedDelegationRuntime(runtime, {
      maxConcurrentPerParent: 2,
      maxDepth: 4,
      maxNodesPerChain: 4,
      returnDeadlineMs: 0,
    })

    await bounded.start({ delegationID: "d1", prompt: "p1", agent: "explore", parentSessionID: "root", parentAgent: "build" })
    await bounded.start({ delegationID: "d2", prompt: "p2", agent: "build", parentSessionID: "root", parentAgent: "build" })
    runtime.setPending("d2")

    await expect(
      bounded.start({ delegationID: "d3", prompt: "p3", agent: "review", parentSessionID: "root", parentAgent: "build" })
    ).rejects.toThrow("delegation-bounds:max-concurrent-exceeded")

    expect(runtime.hasPendingForParent("root")).toBe(true)
    expect(runtime.getActiveCountForParent("root")).toBe(2)

    runtime.complete("d1")
    expect(runtime.getActiveCountForParent("root")).toBe(1)

    await bounded.start({ delegationID: "d3", prompt: "p3", agent: "review", parentSessionID: "root", parentAgent: "build" })
    runtime.timeout("d2")
    runtime.complete("d3")

    const stats = runtime.summary("root")
    expect(stats).toEqual({ pending: 0, running: 0, completed: 2, timeout: 1 })
    expect(runtime.getActiveCountForParent("root")).toBe(0)
    expect(runtime.hasPendingForParent("root")).toBe(false)
  })

  it("enforces maxDepth and maxNodesPerChain near configured limits", async () => {
    const runtime = new StressRuntime()
    const bounded = new BoundedDelegationRuntime(runtime, {
      maxConcurrentPerParent: 3,
      maxDepth: 3,
      maxNodesPerChain: 3,
      returnDeadlineMs: 0,
    })

    const d1 = await bounded.start({ delegationID: "n1", prompt: "n1", agent: "explore", parentSessionID: "root", parentAgent: "main" })
    const d2 = await bounded.start({ delegationID: "n2", prompt: "n2", agent: "build", parentSessionID: d1.sessionID, parentAgent: "explore" })
    await bounded.start({ delegationID: "n3", prompt: "n3", agent: "review", parentSessionID: d2.sessionID, parentAgent: "build" })

    await expect(
      bounded.start({ delegationID: "n4", prompt: "n4", agent: "route", parentSessionID: "child-3", parentAgent: "review" })
    ).rejects.toThrow("delegation-bounds:max-depth-exceeded")
  })

  it("enforces maxNodesPerChain independently", async () => {
    const runtime = new StressRuntime()
    const bounded = new BoundedDelegationRuntime(runtime, {
      maxConcurrentPerParent: 3,
      maxDepth: 6,
      maxNodesPerChain: 2,
      returnDeadlineMs: 0,
    })

    const d1 = await bounded.start({
      delegationID: "chain-1",
      prompt: "chain-1",
      agent: "explore",
      parentSessionID: "root",
      parentAgent: "main",
    })
    const d2 = await bounded.start({
      delegationID: "chain-2",
      prompt: "chain-2",
      agent: "build",
      parentSessionID: d1.sessionID,
      parentAgent: "explore",
    })

    await expect(
      bounded.start({
        delegationID: "chain-3",
        prompt: "chain-3",
        agent: "review",
        parentSessionID: d2.sessionID,
        parentAgent: "build",
      })
    ).rejects.toThrow("delegation-bounds:max-chain-length-exceeded")
  })
})
