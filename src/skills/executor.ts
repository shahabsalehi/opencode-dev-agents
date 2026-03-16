import { enforcePolicyBefore } from "../policy/enforce.js"
import type { RunLedger } from "../audit/run-ledger.js"
import type { StrictControlPolicy } from "../policy/types.js"
import type { SkillDefinition } from "./registry.js"

export type SkillExecutionResult = {
  ok: boolean
  output: string
  blockedReason?: string
}

export function executeSkill(input: {
  skill: SkillDefinition
  sessionID: string
  runLedger: RunLedger
  policy: StrictControlPolicy
  allowlist: string[]
}): SkillExecutionResult {
  if (input.allowlist.length > 0 && !input.allowlist.includes(input.skill.name)) {
    return {
      ok: false,
      output: `Skill '${input.skill.name}' is not allowlisted.`,
      blockedReason: "skill-not-allowlisted",
    }
  }

  const policyToolPrefix = input.skill.riskLevel === "high"
    ? "skill_write"
    : input.skill.riskLevel === "low"
      ? "skill_read"
      : "skill"

  const policyResult = enforcePolicyBefore(
    {
      toolName: `${policyToolPrefix}:${input.skill.name}`,
      args: { description: input.skill.description },
    },
    input.policy,
    input.runLedger,
    input.sessionID
  )

  if (policyResult.blocked && !input.policy.recordOnly) {
    return {
      ok: false,
      output: `Skill blocked by policy: ${policyResult.evaluation.reason}`,
      blockedReason: policyResult.evaluation.reason,
    }
  }

  return {
    ok: true,
    output: input.skill.prompt,
  }
}
