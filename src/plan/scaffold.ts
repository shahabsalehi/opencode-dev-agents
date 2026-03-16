export function buildPlanScaffold(toolName: string, args?: Record<string, unknown>): string {
  const path = typeof args?.filePath === "string"
    ? args.filePath
    : Array.isArray(args?.files) && typeof args.files[0] === "string"
      ? args.files[0]
      : "target-module"

  const title = inferTitle(toolName, path)
  return [
    `plan: ${title}`,
    "## Goal",
    `Safely execute ${toolName} with clear verification evidence.`,
    "## Steps",
    "1. Inspect current implementation and constraints.",
    "2. Apply focused changes only in target scope.",
    "3. Run verification and capture evidence.",
    "## Risks",
    "- Scope drift from unrelated edits.",
    "- Missing verification evidence before finalize.",
  ].join("\n")
}

function inferTitle(toolName: string, path: string): string {
  if (toolName === "edit" || toolName === "write" || toolName === "apply_patch") {
    return `Update ${path}`
  }
  if (toolName === "bash" || toolName === "interactive_bash") {
    return `Run shell operation for ${path}`
  }
  return `Execute ${toolName} safely`
}
