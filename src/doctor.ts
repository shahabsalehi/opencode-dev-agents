import { DEFAULTS, getConfig, setConfig } from "./config.js"
import { resolveFeatureFlags } from "./compat/features.js"
import { checkDeprecations } from "./config-deprecations.js"

export type DoctorReport = {
  mode: string
  strictControlEnabled: boolean
  recordOnly: boolean
  features: ReturnType<typeof resolveFeatureFlags>
  deprecations: Array<{ field: string; message: string; replacement?: string }>
  checks: {
    nodeVersionOk: boolean
    compatibilityFlagsPresent: boolean
  }
}

export function runDoctor(): DoctorReport {
  if (!getConfig().mode) {
    setConfig({})
  }

  const config = getConfig()
  const features = resolveFeatureFlags()
  const deprecations = checkDeprecations(config as unknown as Record<string, unknown>)
  const major = Number.parseInt(process.versions.node.split(".")[0] || "0", 10)

  return {
    mode: config.mode ?? DEFAULTS.mode,
    strictControlEnabled: config.strictControl?.enabled ?? DEFAULTS.strictControl.enabled,
    recordOnly: config.strictControl?.recordOnly ?? DEFAULTS.strictControl.recordOnly,
    features,
    deprecations,
    checks: {
      nodeVersionOk: major >= 18,
      compatibilityFlagsPresent:
        typeof features.enableDelegationRuntime === "boolean" &&
        typeof features.enableExperimentalCompaction === "boolean" &&
        typeof features.enableSystemTransform === "boolean" &&
        typeof features.enableVerificationContract === "boolean" &&
        typeof features.enableChatMessagesTransform === "boolean",
    },
  }
}

function printDoctorReport(report: DoctorReport): void {
  const lines = [
    "SWE Sworm Doctor",
    `Mode: ${report.mode}`,
    `Strict control: ${report.strictControlEnabled}`,
    `Record only: ${report.recordOnly}`,
    `Node >=18: ${report.checks.nodeVersionOk}`,
    `Compatibility flags: ${report.checks.compatibilityFlagsPresent}`,
  ]
  if (report.deprecations.length > 0) {
    lines.push(`Deprecations: ${report.deprecations.length}`)
    for (const warning of report.deprecations) {
      lines.push(`  - ${warning.field}: ${warning.message}${warning.replacement ? ` -> ${warning.replacement}` : ""}`)
    }
  }
  process.stdout.write(`${lines.join("\n")}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = runDoctor()
  printDoctorReport(report)
  if (!report.checks.nodeVersionOk) {
    process.exitCode = 1
  }
}
