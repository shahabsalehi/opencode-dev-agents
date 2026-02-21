export type NormalizedToolOutput = {
  tool: string
  status: "ok" | "warning" | "blocked"
  summary: string
  details?: unknown
}

export function normalizeToolOutput(tool: string, output: unknown, blockedFlags: {
  approvalBlocked?: boolean
  policyBlocked?: boolean
  budgetBlocked?: boolean
  delegationBlocked?: boolean
}): NormalizedToolOutput {
  const blocked = blockedFlags.approvalBlocked ||
    blockedFlags.policyBlocked ||
    blockedFlags.budgetBlocked ||
    blockedFlags.delegationBlocked

  if (blocked) {
    return {
      tool,
      status: "blocked",
      summary: "Execution blocked by governance control.",
      details: output,
    }
  }

  if (typeof output === "string") {
    return {
      tool,
      status: output.toLowerCase().includes("warning") ? "warning" : "ok",
      summary: output.length > 240 ? `${output.slice(0, 240)}...` : output,
      details: output,
    }
  }

  return {
    tool,
    status: "ok",
    summary: "Structured result available.",
    details: output,
  }
}
