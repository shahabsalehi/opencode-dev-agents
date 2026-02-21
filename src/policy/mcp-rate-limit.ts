type CounterKey = `${string}::${string}`

export class McpRateLimiter {
  private counters = new Map<CounterKey, number>()

  check(serverPrefix: string, sessionID: string, maxCallsPerSession: number): {
    allowed: boolean
    used: number
  } {
    const key = this.buildKey(serverPrefix, sessionID)
    const used = this.counters.get(key) ?? 0
    return {
      allowed: used < maxCallsPerSession,
      used,
    }
  }

  record(serverPrefix: string, sessionID: string): void {
    const key = this.buildKey(serverPrefix, sessionID)
    const used = this.counters.get(key) ?? 0
    this.counters.set(key, used + 1)
  }

  reset(): void {
    this.counters.clear()
  }

  private buildKey(serverPrefix: string, sessionID: string): CounterKey {
    return `${serverPrefix}::${sessionID}`
  }
}

export const mcpRateLimiter = new McpRateLimiter()
