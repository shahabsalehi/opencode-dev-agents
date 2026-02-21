export function shouldTrackMutation(toolName: string, args: Record<string, unknown> | undefined): boolean {
  if (toolName === "edit" || toolName === "write" || toolName === "apply_patch" || toolName === "testGenerator") {
    return true
  }

  if (toolName === "refactorEngine") {
    return args?.dryRun === false
  }

  return false
}
