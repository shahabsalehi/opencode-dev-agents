import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { describe, expect, it } from "vitest"
import { ApprovalStore } from "../../src/approval-gates.js"
import { RunLedger } from "../../src/audit/run-ledger.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../src/policy/defaults.js"
import { enforcePolicyBefore } from "../../src/policy/enforce.js"
import { listThoughts, saveThought } from "../../src/thoughts/store.js"

describe("long-horizon scenario", () => {
  it("stays stable across 240 sequential mixed tool calls", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "swe-bundle-01-"))
    const sessionID = "bundle-01-session"
    const ledger = new RunLedger()
    const approvals = new ApprovalStore()
    const iterations = 240
    const refreshEvery = 30
    const approveEvery = 40
    const tools = ["read", "edit", "governance_eval", "bash", "thought_list"] as const

    try {
      for (let i = 1; i <= iterations; i += 1) {
        const toolName = tools[(i - 1) % tools.length]
        const callID = `call-${i}`
        const args = toolName === "bash"
          ? { command: "npm run test" }
          : toolName === "edit"
            ? { filePath: `src/file-${i}.ts`, oldText: "a", newText: "b" }
            : { index: i }

        const policy = enforcePolicyBefore(
          { toolName, args },
          DEFAULT_STRICT_CONTROL_POLICY,
          ledger,
          sessionID
        )

        ledger.recordToolCall(sessionID)
        if (toolName === "edit") {
          ledger.recordMutation(sessionID)
        }

        expect(policy.blocked).toBe(false)

        if (i % approveEvery === 0) {
          approvals.requestApproval(sessionID, callID, "edit", { filePath: `src/file-${i}.ts` })
          expect(approvals.approve(sessionID, callID, "periodic-approval", 60_000)).toBe(true)
          expect(approvals.isApproved(sessionID, callID)).toBe(true)
        }

        if (i % refreshEvery === 0) {
          await saveThought(workspace, {
            id: `thought-${i}`,
            title: `plan: refresh-${i}`,
            content: `refresh checkpoint ${i}`,
            createdAt: Date.now(),
          })
        }
      }

      const state = ledger.get(sessionID)
      const snapshots = ledger.toJSON()
      const thoughts = await listThoughts(workspace)
      const policyTotal = state.policy.allow + state.policy.deny + state.policy.needsApproval

      expect(state.toolCalls).toBe(iterations)
      expect(state.filesModified).toBe(iterations / tools.length)
      expect(policyTotal).toBe(iterations)
      expect(state.policy.deny).toBe(0)
      expect(state.policy.byRisk.critical).toBe(0)
      expect(snapshots).toHaveLength(1)
      expect(thoughts).toHaveLength(iterations / refreshEvery)
      expect(thoughts.every((item) => item.title.startsWith("plan:"))).toBe(true)
      expect(approvals.getPendingApprovals(sessionID)).toHaveLength(0)
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
})
