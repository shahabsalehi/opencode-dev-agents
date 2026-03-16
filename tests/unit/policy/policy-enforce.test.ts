import { describe, expect, it } from "vitest"
import { RunLedger } from "../../../src/audit/run-ledger.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../../src/policy/defaults.js"
import { enforcePolicyBefore, shouldRequireApproval } from "../../../src/policy/enforce.js"

describe("policy enforce", () => {
  it("blocks redline bash command", () => {
    const ledger = new RunLedger()
    const result = enforcePolicyBefore(
      {
        toolName: "bash",
        args: { command: "git push origin main" },
      },
      DEFAULT_STRICT_CONTROL_POLICY,
      ledger,
      "session-a"
    )

    expect(result.blocked).toBe(true)
    expect(result.evaluation.decision).toBe("deny")
    expect(result.evaluation.risk).toBe("critical")
    expect(result.evaluation.matchedRuleID).toBe("git-push")
    expect(ledger.get("session-a").policy.deny).toBe(1)
  })

  it("allows low risk tool in strict record-only mode", () => {
    const ledger = new RunLedger()
    const result = enforcePolicyBefore(
      { toolName: "read", args: { filePath: "src/index.ts" } },
      DEFAULT_STRICT_CONTROL_POLICY,
      ledger,
      "session-b"
    )

    expect(result.blocked).toBe(false)
    expect(result.evaluation.decision).toBe("allow")
    expect(result.evaluation.risk).toBe("low")
  })

  it("blocks redline interactive bash command", () => {
    const ledger = new RunLedger()
    const result = enforcePolicyBefore(
      {
        toolName: "interactive_bash",
        args: { tmux_command: "send-keys \"git push origin main\" Enter" },
      },
      DEFAULT_STRICT_CONTROL_POLICY,
      ledger,
      "session-c"
    )

    expect(result.blocked).toBe(true)
    expect(result.evaluation.decision).toBe("deny")
    expect(result.evaluation.matchedRuleID).toBe("git-push")
  })

  it("requires approval for high risk policy evaluations", () => {
    const result = enforcePolicyBefore(
      { toolName: "edit", args: { filePath: "src/index.ts" } },
      { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: false },
      new RunLedger(),
      "session-d"
    )

    expect(shouldRequireApproval(result.evaluation)).toBe(true)
    expect(result.evaluation.decision).toBe("needs-approval")
  })
})
