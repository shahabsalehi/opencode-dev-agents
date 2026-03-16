import { describe, expect, it } from "vitest"
import { RunLedger } from "../../../src/audit/run-ledger.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../../src/policy/defaults.js"
import { executeSkill } from "../../../src/skills/executor.js"

describe("skills executor", () => {
  it("blocks skills outside allowlist", () => {
    const result = executeSkill({
      skill: { name: "safe-refactor", description: "desc", prompt: "prompt" },
      sessionID: "s1",
      runLedger: new RunLedger(),
      policy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: false },
      allowlist: ["governance-review"],
    })

    expect(result.ok).toBe(false)
    expect(result.blockedReason).toBe("skill-not-allowlisted")
  })

  it("returns prompt for allowlisted skill", () => {
    const runLedger = new RunLedger()
    const result = executeSkill({
      skill: { name: "safe-refactor", description: "desc", prompt: "prompt", riskLevel: "medium" },
      sessionID: "s1",
      runLedger,
      policy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: false },
      allowlist: ["safe-refactor"],
    })

    expect(result.ok).toBe(true)
    expect(result.output).toBe("prompt")
    expect(runLedger.get("s1").policy.needsApproval).toBe(1)
  })

  it("allows low-risk skill without approval", () => {
    const runLedger = new RunLedger()
    const result = executeSkill({
      skill: { name: "dependency-audit", description: "desc", prompt: "prompt", riskLevel: "low" },
      sessionID: "s2",
      runLedger,
      policy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: false },
      allowlist: ["dependency-audit"],
    })

    expect(result.ok).toBe(true)
    expect(runLedger.get("s2").policy.allow).toBe(1)
  })
})
