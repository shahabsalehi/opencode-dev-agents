import { describe, expect, it, vi } from "vitest"
import { createGovernanceHooks } from "../../../src/create-hooks.js"
import { RunLedger } from "../../../src/audit/run-ledger.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../../src/policy/defaults.js"

function createHooks(options?: {
  enableTextCompleteHook?: boolean
  strictPolicy?: typeof DEFAULT_STRICT_CONTROL_POLICY
}) {
  return createGovernanceHooks({
    strictPolicy: options?.strictPolicy ?? { ...DEFAULT_STRICT_CONTROL_POLICY, enabled: true, recordOnly: false },
    runLedger: new RunLedger(),
    directory: "/tmp/swe-hooks-text-complete",
    governanceMetadata: {
      worktree: "/tmp/swe-hooks-text-complete",
      projectID: "proj-text-complete",
      serverUrl: "http://localhost:4096",
    },
    approvalStore: {
      getPendingApprovals: () => [],
    },
    client: {
      app: {
        log: vi.fn().mockResolvedValue({}),
      },
    },
    enableChatMessagesTransform: true,
    enableTextCompleteHook: options?.enableTextCompleteHook ?? true,
  })
}

describe("create hooks text complete", () => {
  it("appends governance suffix when enabled and strict non-record mode", async () => {
    const hooks = createHooks({ enableTextCompleteHook: true })
    const output = { text: "Hello" }

    await hooks["experimental.text.complete"]?.(
      { sessionID: "ses-text", messageID: "msg-1", partID: "part-1" },
      output
    )

    expect(output.text).toContain("Hello")
    expect(output.text).toContain("governance: verified-output")
  })

  it("does not mutate text when hook flag is disabled", async () => {
    const hooks = createHooks({ enableTextCompleteHook: false })
    const output = { text: "Original" }

    await hooks["experimental.text.complete"]?.(
      { sessionID: "ses-text", messageID: "msg-2", partID: "part-2" },
      output
    )

    expect(output.text).toBe("Original")
  })

  it("does not mutate text in record-only mode", async () => {
    const hooks = createHooks({
      enableTextCompleteHook: true,
      strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, enabled: true, recordOnly: true },
    })
    const output = { text: "RecordOnly" }

    await hooks["experimental.text.complete"]?.(
      { sessionID: "ses-text", messageID: "msg-3", partID: "part-3" },
      output
    )

    expect(output.text).toBe("RecordOnly")
  })
})
