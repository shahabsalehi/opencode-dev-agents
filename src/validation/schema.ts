type ToolOutput = {
  summary: Record<string, unknown>
  details: string
  metadata: Record<string, unknown>
}

export function validateToolOutput(value: unknown): value is ToolOutput {
  if (!value || typeof value !== "object") return false
  const data = value as ToolOutput
  if (!data.summary || typeof data.summary !== "object") return false
  if (typeof data.details !== "string") return false
  if (!data.metadata || typeof data.metadata !== "object") return false
  return true
}

export function wrapToolOutput(value: ToolOutput): string {
  return JSON.stringify(value, null, 2)
}
