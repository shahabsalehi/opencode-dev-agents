import type { RedlineRule } from "./types.js"

export const DEFAULT_REDLINE_RULES: RedlineRule[] = [
  {
    id: "git-push",
    description: "Disallow git push without explicit override",
    pattern: /\bgit\s+push(?=\s|$)/i,
  },
  {
    id: "git-reset-hard",
    description: "Disallow git reset --hard",
    pattern: /\bgit\s+reset\s+--hard\b/i,
  },
  {
    id: "git-clean-fdx",
    description: "Disallow git clean -fdx",
    pattern: /\bgit\s+clean\s+-(?=[a-z]*f)(?=[a-z]*d)(?=[a-z]*x)[a-z]+\b/i,
  },
  {
    id: "rm-rf",
    description: "Disallow recursive force deletes",
    pattern: /\brm\s+-[a-z]*(?:r[a-z]*f|f[a-z]*r)[a-z]*\b/i,
  },
  {
    id: "sudo",
    description: "Disallow elevated shell execution",
    pattern: /\bsudo\b/i,
  },
  {
    id: "chmod-recursive",
    description: "Disallow recursive chmod",
    pattern: /\bchmod\s+-[a-zA-Z]*R[a-zA-Z]*\b/i,
  },
  {
    id: "chown-recursive",
    description: "Disallow recursive chown",
    pattern: /\bchown\s+-[a-zA-Z]*R[a-zA-Z]*\b/i,
  },
]

export function findMatchedRedline(command: string, rules: RedlineRule[]): RedlineRule | null {
  for (const rule of rules) {
    if (rule.pattern.test(command)) {
      return rule
    }
  }
  return null
}
