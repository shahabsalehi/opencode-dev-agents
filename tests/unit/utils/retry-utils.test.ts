import { describe, expect, it } from "vitest"
import { isTransientError, withRetries } from "../../../src/utils/retry.js"

describe("retry utils", () => {
  it("retries transient failure and succeeds", async () => {
    let count = 0
    const result = await withRetries(
      async () => {
        count += 1
        if (count < 2) throw new Error("network timeout")
        return "ok"
      },
      { attempts: 3, delayMs: 1 },
      isTransientError
    )
    expect(result).toBe("ok")
  })

  it("does not retry non-transient error", async () => {
    await expect(
      withRetries(
        async () => {
          throw new Error("validation failed")
        },
        { attempts: 3, delayMs: 1 },
        isTransientError
      )
    ).rejects.toThrow("validation failed")
  })
})
