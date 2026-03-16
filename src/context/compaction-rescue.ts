export type CompactionSnapshot = {
  context: string[]
  capturedAt: number
}

export type CompactionRescueConfig = {
  cooldownMs: number
  maxCacheSize: number
}

const DEFAULT_RESCUE_CONFIG: CompactionRescueConfig = {
  cooldownMs: 30_000,
  maxCacheSize: 10,
}

export class CompactionRescueCache {
  private readonly snapshots = new Map<string, CompactionSnapshot>()
  private readonly lastRescueAt = new Map<string, number>()
  private readonly config: CompactionRescueConfig

  constructor(config?: Partial<CompactionRescueConfig>) {
    this.config = { ...DEFAULT_RESCUE_CONFIG, ...config }
  }

  captureSnapshot(sessionID: string, context: string[]): void {
    if (this.snapshots.size >= this.config.maxCacheSize && !this.snapshots.has(sessionID)) {
      const oldest = this.findOldestEntry()
      if (oldest) this.snapshots.delete(oldest)
    }
    this.snapshots.set(sessionID, {
      context: [...context],
      capturedAt: Date.now(),
    })
  }

  rescue(sessionID: string, _failedOutput: string[]): string[] | null {
    const now = Date.now()
    const lastRescue = this.lastRescueAt.get(sessionID) ?? 0
    if (now - lastRescue < this.config.cooldownMs) {
      return null
    }

    const snapshot = this.snapshots.get(sessionID)
    if (!snapshot || snapshot.context.length === 0) {
      return null
    }

    this.lastRescueAt.set(sessionID, now)
    return [...snapshot.context]
  }

  hasSnapshot(sessionID: string): boolean {
    return this.snapshots.has(sessionID)
  }

  clear(sessionID: string): void {
    this.snapshots.delete(sessionID)
    this.lastRescueAt.delete(sessionID)
  }

  dispose(): void {
    this.snapshots.clear()
    this.lastRescueAt.clear()
  }

  private findOldestEntry(): string | null {
    let oldest: string | null = null
    let oldestTime = Infinity
    for (const [key, value] of this.snapshots) {
      if (value.capturedAt < oldestTime) {
        oldestTime = value.capturedAt
        oldest = key
      }
    }
    return oldest
  }
}
