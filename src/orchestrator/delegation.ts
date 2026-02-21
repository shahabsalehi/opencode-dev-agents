export type DelegationStartInput = {
  delegationID: string
  prompt: string
  agent: string
  parentSessionID: string
  parentAgent: string
}

export type DelegationStartResult = {
  delegationID: string
  sessionID: string
}

export interface DelegationRuntimeLike {
  start(input: DelegationStartInput): Promise<DelegationStartResult>
  hasPendingForParent(parentSessionID: string): boolean
  getActiveCountForParent(parentSessionID: string): number
  handleSessionIdle(sessionID: string): Promise<void>
  handleSessionError(sessionID: string, error: string): Promise<void>
}

export type DelegationBounds = {
  maxConcurrentPerParent: number
  maxDepth: number
  maxNodesPerChain: number
  returnDeadlineMs: number
}

const DEFAULT_BOUNDS: DelegationBounds = {
  maxConcurrentPerParent: 1,
  maxDepth: 2,
  maxNodesPerChain: 3,
  returnDeadlineMs: 300_000,
}

export class BoundedDelegationRuntime {
  private readonly depthBySession = new Map<string, number>()
  private readonly chainBySession = new Map<string, string[]>()
  private readonly deadlines = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly runtime: DelegationRuntimeLike,
    private readonly bounds: DelegationBounds = DEFAULT_BOUNDS
  ) {}

  hasPendingForParent(parentSessionID: string): boolean {
    return this.runtime.hasPendingForParent(parentSessionID)
  }

  getActiveCountForParent(parentSessionID: string): number {
    return this.runtime.getActiveCountForParent(parentSessionID)
  }

  async handleSessionIdle(sessionID: string): Promise<void> {
    this.cleanupSession(sessionID)
    await this.runtime.handleSessionIdle(sessionID)
  }

  async handleSessionError(sessionID: string, error: string): Promise<void> {
    this.cleanupSession(sessionID)
    await this.runtime.handleSessionError(sessionID, error)
  }

  async start(input: DelegationStartInput): Promise<DelegationStartResult> {
    const activeForParent = this.runtime.getActiveCountForParent(input.parentSessionID)
    if (activeForParent >= this.bounds.maxConcurrentPerParent) {
      throw new Error(
        `delegation-bounds:max-concurrent-exceeded:${activeForParent}/${this.bounds.maxConcurrentPerParent}`
      )
    }

    const parentDepth = this.depthBySession.get(input.parentSessionID) ?? 0
    const nextDepth = parentDepth + 1
    if (nextDepth > this.bounds.maxDepth) {
      throw new Error(
        `delegation-bounds:max-depth-exceeded:${nextDepth}/${this.bounds.maxDepth}`
      )
    }

    const parentChain = this.chainBySession.get(input.parentSessionID) ?? []
    if (parentChain.includes(input.agent)) {
      throw new Error(
        `delegation-bounds:cycle-detected:${input.agent} already in chain [${parentChain.join("->")}]`
      )
    }

    if (parentChain.length + 1 > this.bounds.maxNodesPerChain) {
      throw new Error(
        `delegation-bounds:max-chain-length-exceeded:${parentChain.length + 1}/${this.bounds.maxNodesPerChain}`
      )
    }

    const started = await this.runtime.start(input)
    this.depthBySession.set(started.sessionID, nextDepth)
    this.chainBySession.set(started.sessionID, [...parentChain, input.agent])

    if (this.bounds.returnDeadlineMs > 0) {
      const timer = setTimeout(() => {
        this.cleanupSession(started.sessionID)
        this.runtime.handleSessionError(started.sessionID, "delegation-bounds:deadline-exceeded").catch(() => undefined)
      }, this.bounds.returnDeadlineMs)
      if (typeof timer === "object" && "unref" in timer) {
        timer.unref()
      }
      this.deadlines.set(started.sessionID, timer)
    }

    return started
  }

  dispose(): void {
    for (const timer of this.deadlines.values()) {
      clearTimeout(timer)
    }
    this.deadlines.clear()
    this.depthBySession.clear()
    this.chainBySession.clear()
  }

  private cleanupSession(sessionID: string): void {
    this.depthBySession.delete(sessionID)
    this.chainBySession.delete(sessionID)
    const timer = this.deadlines.get(sessionID)
    if (timer) {
      clearTimeout(timer)
      this.deadlines.delete(sessionID)
    }
  }
}

export function createBoundedDelegationRuntime(
  runtime: DelegationRuntimeLike,
  bounds?: Partial<DelegationBounds>
): BoundedDelegationRuntime {
  return new BoundedDelegationRuntime(runtime, {
    ...DEFAULT_BOUNDS,
    ...bounds,
  })
}
