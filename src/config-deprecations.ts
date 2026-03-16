export type DeprecationWarning = {
  field: string
  message: string
  replacement?: string
}

export function checkDeprecations(config: Record<string, unknown>): DeprecationWarning[] {
  const warnings: DeprecationWarning[] = []

  if ("mcpEnabled" in config) {
    warnings.push({
      field: "mcpEnabled",
      message: "Top-level mcpEnabled is deprecated.",
      replacement: "strictControl.mcpEnabled",
    })
  }

  if ("mcpAllowlist" in config) {
    warnings.push({
      field: "mcpAllowlist",
      message: "Top-level mcpAllowlist is deprecated.",
      replacement: "strictControl.mcpAllowlist",
    })
  }

  if ("mcpDenylist" in config) {
    warnings.push({
      field: "mcpDenylist",
      message: "Top-level mcpDenylist is deprecated.",
      replacement: "strictControl.mcpDenylist",
    })
  }

  return warnings
}
