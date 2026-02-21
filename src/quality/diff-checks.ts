export type DiffSummary = {
  files: number
  additions: number
  deletions: number
}

export function evaluateDiffQuality(input: {
  toolName: string
  diff: DiffSummary | null
  verificationEvidence?: Record<string, unknown>
}): string[] {
  const warnings: string[] = []
  const diff = input.diff
  if (!diff) return warnings

  if (diff.files > 8) {
    warnings.push("Large change scope detected; consider splitting into smaller focused changes.")
  }

  if (diff.additions + diff.deletions > 350) {
    warnings.push("Large line delta detected; verify unrelated edits are excluded.")
  }

  if (isMutationTool(input.toolName) && !hasTestEvidence(input.verificationEvidence)) {
    warnings.push("Mutation completed without explicit test evidence; run relevant tests before finalizing.")
  }

  return warnings
}

function isMutationTool(toolName: string): boolean {
  return toolName === "edit" ||
    toolName === "write" ||
    toolName === "apply_patch" ||
    toolName === "bash" ||
    toolName === "testGenerator" ||
    toolName === "refactorEngine"
}

function hasTestEvidence(evidence: Record<string, unknown> | undefined): boolean {
  if (!evidence) return false
  const result = evidence as Record<string, unknown>
  return result.tests === true || result.typecheck === true || result.build === true
}
