import { describe, expect, it } from "vitest"
import { BoundedDelegationRuntime, type DelegationRuntimeLike } from "../../../src/orchestrator/delegation.js"

class FakeRuntime implements DelegationRuntimeLike {
  private activeByParent = new Map<string, number>()
  private counter = 0

  setActive(parentSessionID: string, count: number): void {
    this.activeByParent.set(parentSessionID, count)
  }

  async start(input: {
    delegationID: string
    prompt: string
    agent: string
    parentSessionID: string
    parentAgent: string
  }): Promise<{ delegationID: string; sessionID: string }> {
    this.counter += 1
    return { delegationID: input.delegationID, sessionID: `child-${this.counter}` }
  }

  hasPendingForParent(parentSessionID: string): boolean {
    return (this.activeByParent.get(parentSessionID) || 0) > 0
  }

  getActiveCountForParent(parentSessionID: string): number {
    return this.activeByParent.get(parentSessionID) || 0
  }

  async handleSessionIdle(): Promise<void> {
    return
  }

  async handleSessionError(): Promise<void> {
    return
  }
}

describe("bounded delegation runtime", () => {
  it("blocks when concurrent delegation limit is exceeded", async () => {
    const runtime = new FakeRuntime()
    runtime.setActive("parent-a", 1)

    const bounded = new BoundedDelegationRuntime(runtime, {
      maxConcurrentPerParent: 1,
      maxDepth: 1,
      maxNodesPerChain: 3,
      returnDeadlineMs: 0,
    })

    await expect(
      bounded.start({
        delegationID: "del-1",
        prompt: "do work",
        agent: "explore",
        parentSessionID: "parent-a",
        parentAgent: "main",
      })
    ).rejects.toThrow("delegation-bounds:max-concurrent-exceeded")
  })

  it("blocks nested delegation beyond max depth", async () => {
    const runtime = new FakeRuntime()
    const bounded = new BoundedDelegationRuntime(runtime, {
      maxConcurrentPerParent: 1,
      maxDepth: 1,
      maxNodesPerChain: 3,
      returnDeadlineMs: 0,
    })

    const first = await bounded.start({
      delegationID: "del-1",
      prompt: "do work",
      agent: "explore",
      parentSessionID: "parent-root",
      parentAgent: "main",
    })

    await expect(
      bounded.start({
        delegationID: "del-2",
        prompt: "nested",
        agent: "explore",
        parentSessionID: first.sessionID,
        parentAgent: "main",
      })
    ).rejects.toThrow("delegation-bounds:max-depth-exceeded")
  })

  it("allows first delegation within bounds", async () => {
    const runtime = new FakeRuntime()
    const bounded = new BoundedDelegationRuntime(runtime, {
      maxConcurrentPerParent: 1,
      maxDepth: 1,
      maxNodesPerChain: 3,
      returnDeadlineMs: 0,
    })

    const started = await bounded.start({
      delegationID: "del-1",
      prompt: "do work",
      agent: "explore",
      parentSessionID: "parent-root",
      parentAgent: "main",
    })

    expect(started.delegationID).toBe("del-1")
    expect(started.sessionID).toBe("child-1")
  })

  it("cleans tracked depth on idle and error", async () => {
    const runtime = new FakeRuntime()
    const bounded = new BoundedDelegationRuntime(runtime, {
      maxConcurrentPerParent: 1,
      maxDepth: 1,
      maxNodesPerChain: 3,
      returnDeadlineMs: 0,
    })

    const started = await bounded.start({
      delegationID: "del-1",
      prompt: "do work",
      agent: "explore",
      parentSessionID: "parent-root",
      parentAgent: "main",
    })

    await expect(
      bounded.start({
        delegationID: "del-2",
        prompt: "nested",
        agent: "explore",
        parentSessionID: started.sessionID,
        parentAgent: "main",
      })
    ).rejects.toThrow("delegation-bounds:max-depth-exceeded")

    await bounded.handleSessionIdle(started.sessionID)

    await expect(
      bounded.start({
        delegationID: "del-3",
        prompt: "nested-after-idle",
        agent: "explore",
        parentSessionID: started.sessionID,
        parentAgent: "main",
      })
    ).resolves.toEqual({ delegationID: "del-3", sessionID: "child-2" })

    await bounded.handleSessionError("child-2", "test-error")
  })

  it("blocks delegation cycle when agent already appears in chain", async () => {
    const runtime = new FakeRuntime()
    const bounded = new BoundedDelegationRuntime(runtime, {
      maxConcurrentPerParent: 2,
      maxDepth: 3,
      maxNodesPerChain: 3,
      returnDeadlineMs: 0,
    })

    const first = await bounded.start({
      delegationID: "del-1",
      prompt: "task A",
      agent: "explore",
      parentSessionID: "root",
      parentAgent: "main",
    })

    await expect(
      bounded.start({
        delegationID: "del-2",
        prompt: "task B",
        agent: "explore",
        parentSessionID: first.sessionID,
        parentAgent: "explore",
      })
    ).rejects.toThrow("delegation-bounds:cycle-detected")
  })

  it("blocks when chain length exceeds max nodes", async () => {
    const runtime = new FakeRuntime()
    const bounded = new BoundedDelegationRuntime(runtime, {
      maxConcurrentPerParent: 2,
      maxDepth: 5,
      maxNodesPerChain: 2,
      returnDeadlineMs: 0,
    })

    const first = await bounded.start({
      delegationID: "del-1",
      prompt: "task A",
      agent: "explore",
      parentSessionID: "root",
      parentAgent: "main",
    })

    const second = await bounded.start({
      delegationID: "del-2",
      prompt: "task B",
      agent: "build",
      parentSessionID: first.sessionID,
      parentAgent: "explore",
    })

    await expect(
      bounded.start({
        delegationID: "del-3",
        prompt: "task C",
        agent: "review",
        parentSessionID: second.sessionID,
        parentAgent: "build",
      })
    ).rejects.toThrow("delegation-bounds:max-chain-length-exceeded")
  })

  it("fires deadline timeout and cleans tracked state", async () => {
    const runtime = new FakeRuntime()
    let errorCalled = false
    runtime.handleSessionError = async () => {
      errorCalled = true
    }
    const bounded = new BoundedDelegationRuntime(runtime, {
      maxConcurrentPerParent: 1,
      maxDepth: 2,
      maxNodesPerChain: 3,
      returnDeadlineMs: 30,
    })

    await bounded.start({
      delegationID: "del-1",
      prompt: "slow task",
      agent: "explore",
      parentSessionID: "root",
      parentAgent: "main",
    })

    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(errorCalled).toBe(true)
  })

  it("dispose clears timers and allows fresh delegations", async () => {
    const runtime = new FakeRuntime()
    const bounded = new BoundedDelegationRuntime(runtime, {
      maxConcurrentPerParent: 2,
      maxDepth: 2,
      maxNodesPerChain: 3,
      returnDeadlineMs: 60_000,
    })

    await bounded.start({
      delegationID: "del-1",
      prompt: "task",
      agent: "explore",
      parentSessionID: "root",
      parentAgent: "main",
    })

    bounded.dispose()

    const second = await bounded.start({
      delegationID: "del-2",
      prompt: "task",
      agent: "build",
      parentSessionID: "root",
      parentAgent: "main",
    })
    expect(second.delegationID).toBe("del-2")
  })
})
