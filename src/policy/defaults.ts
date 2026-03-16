import type { StrictControlPolicy } from "./types.js"
import { DEFAULT_REDLINE_RULES } from "./redlines.js"

export const DEFAULT_STRICT_CONTROL_POLICY: StrictControlPolicy = {
  enabled: true,
  enforceRedlines: true,
  recordOnly: true,
  adaptive: {
    enabled: false,
  },
  mcp: {
    enabled: true,
    allowlist: [],
    denylist: [],
    capabilityRules: [],
  },
  budgets: {
    maxChangedFiles: 5,
    maxTotalLocDelta: 400,
    maxNewFiles: 5,
    maxToolCalls: 25,
  },
  redlineRules: DEFAULT_REDLINE_RULES,
}
