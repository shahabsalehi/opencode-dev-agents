import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { describe, expect, it } from "vitest"
import { approvalStore } from "../../../src/approval-gates.js"
import { RunLedger } from "../../../src/audit/run-ledger.js"
import { createGovernanceTools } from "../../../src/create-governance-tools.js"
import { saveDelegation } from "../../../src/delegation/store.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../../src/policy/defaults.js"
import { SkillsRegistry } from "../../../src/skills/registry.js"
import { saveThought } from "../../../src/thoughts/store.js"

function decideFromHud(hud: string): "continue" | "escalate" | "stop" {
  if (hud.includes("Policy: allow") && hud.includes("deny 0") && hud.includes("Approvals pending: 0") && hud.includes("Delegations: running 0 | pending 0") && hud.includes("Verification failures: 0")) {
    return "continue"
  }
  if (hud.includes("deny 0") && (/Approvals pending: [1-9]/.test(hud) || /Delegations: running [1-9]/.test(hud))) {
    return "escalate"
  }
  return "stop"
}

describe("session HUD actionability", () => {
  it("provides concise decision-sufficient and internally consistent HUD signals", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swe-bundle-14-"))
    const sessionID = "bundle-14"
    try {
      const runLedger = new RunLedger()
      runLedger.recordToolCall(sessionID)
      runLedger.recordPolicyDecision(sessionID, "allow", "low")

      const tools = createGovernanceTools({
        runLedger,
        skillsRegistry: new SkillsRegistry(),
        strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: false },
        sessionMetrics: {
          toolCalls: 1,
          filesModified: 0,
          largeDiffDetected: false,
          failedVerificationCount: 0,
          adaptiveStrictness: "normal",
        },
        availableAgents: new Set(["build"]),
        delegationRuntime: null,
        approvalTtlMs: 60_000,
        approvalDefaultReason: "manual",
      })

      await saveThought(dir, {
        id: "plan-1",
        title: "plan: continue safely",
        content: "run checks and keep scope tight",
        createdAt: Date.now(),
      })

      const context = {
        directory: dir,
        sessionID,
        messageID: "msg-14",
        agent: "build",
        worktree: dir,
        abort: new AbortController().signal,
        metadata: () => undefined,
        ask: async () => undefined,
      }

      const hudContinue = await tools.session_hud.execute({}, context)
      expect(String(hudContinue)).toContain("Session HUD")
      expect(String(hudContinue)).toContain("Policy: allow 1 | deny 0 | ask 0")
      expect(String(hudContinue)).toContain("ask 0")
      expect(String(hudContinue)).toContain("Approvals pending: 0")
      expect(decideFromHud(String(hudContinue))).toBe("continue")

      approvalStore.requestApproval(sessionID, "c1", "edit", { filePath: "src/a.ts" })
      await saveDelegation(dir, {
        id: "del-1",
        prompt: "investigate",
        agent: "explore",
        createdAt: Date.now(),
        status: "running",
      })
      const hudEscalate = await tools.session_hud.execute({}, context)
      expect(String(hudEscalate)).toContain("Approvals pending: 1")
      expect(String(hudEscalate)).toContain("Delegations: running 1 | pending 0")
      expect(decideFromHud(String(hudEscalate))).toBe("escalate")

      runLedger.recordPolicyDecision(sessionID, "deny", "critical")
      const hudStop = await tools.session_hud.execute({}, context)
      expect(String(hudStop)).toContain("deny 1")
      expect(decideFromHud(String(hudStop))).toBe("stop")
      expect(String(hudStop)).not.toContain("Approvals pending: 0\nApprovals pending: 1")
    } finally {
      approvalStore.approveAllForSession(sessionID)
      await rm(dir, { recursive: true, force: true })
    }
  })
})
