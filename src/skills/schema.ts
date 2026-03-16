import type { SkillDefinition } from "./registry.js"

export function validateSkillDefinition(raw: unknown): {
  valid: boolean
  errors: string[]
  skill?: SkillDefinition
} {
  const errors: string[] = []
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, errors: ["skill must be an object"] }
  }

  const value = raw as Record<string, unknown>
  const name = value.name
  const description = value.description
  const prompt = value.prompt
  const riskLevel = value.riskLevel

  if (typeof name !== "string" || name.trim().length === 0) {
    errors.push("name is required")
  } else if (!/^[a-z0-9-]+$/.test(name)) {
    errors.push("name must match ^[a-z0-9-]+$")
  }

  if (typeof description !== "string" || description.trim().length === 0) {
    errors.push("description is required")
  }

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    errors.push("prompt is required")
  }

  if (prompt && typeof prompt === "string" && prompt.length > 4000) {
    errors.push("prompt must be <= 4000 characters")
  }

  if (riskLevel !== undefined && riskLevel !== "low" && riskLevel !== "medium" && riskLevel !== "high") {
    errors.push("riskLevel must be one of low, medium, high")
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  const safeName = name as string
  const safeDescription = description as string
  const safePrompt = prompt as string

  return {
    valid: true,
    errors,
    skill: {
      name: safeName,
      description: safeDescription,
      prompt: safePrompt,
      riskLevel: riskLevel as SkillDefinition["riskLevel"],
    },
  }
}
