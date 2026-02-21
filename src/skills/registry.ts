export type SkillDefinition = {
  name: string
  description: string
  prompt: string
  riskLevel?: "low" | "medium" | "high"
}

export class SkillsRegistry {
  private skills = new Map<string, SkillDefinition>()

  register(skill: SkillDefinition): void {
    this.skills.set(skill.name, skill)
  }

  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name)
  }

  has(name: string): boolean {
    return this.skills.has(name)
  }

  count(): number {
    return this.skills.size
  }

  list(): SkillDefinition[] {
    return Array.from(this.skills.values()).sort((a, b) => a.name.localeCompare(b.name))
  }
}
