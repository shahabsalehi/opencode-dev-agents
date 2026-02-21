export type RetryPolicy = {
  attempts: number
  delayMs: number
  maxDelayMs?: number
}

export async function withRetries<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy,
  isRetryable: (error: unknown) => boolean
): Promise<T> {
  let attempt = 0
  let delay = policy.delayMs
  let lastError: unknown

  while (attempt < policy.attempts) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      attempt += 1
      if (attempt >= policy.attempts || !isRetryable(error)) {
        throw error
      }
      await sleep(delay)
      if (policy.maxDelayMs) {
        delay = Math.min(policy.maxDelayMs, delay * 2)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("retry-operation-failed")
}

export function isTransientError(error: unknown): boolean {
  const message = String(error).toLowerCase()
  return message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("econn") ||
    message.includes("network") ||
    message.includes("socket") ||
    message.includes("rate limit")
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
