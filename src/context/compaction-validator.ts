export type CompactionValidation = {
  valid: boolean
  reason: string
}

const MIN_CONTEXT_LENGTH = 1
const MIN_TOTAL_CHARS = 20

export function validateCompactionOutput(context: string[]): CompactionValidation {
  if (!Array.isArray(context)) {
    return { valid: false, reason: "compaction-output-not-array" }
  }
  if (context.length < MIN_CONTEXT_LENGTH) {
    return { valid: false, reason: "compaction-output-empty" }
  }
  const totalChars = context.reduce((sum, block) => sum + block.length, 0)
  if (totalChars < MIN_TOTAL_CHARS) {
    return { valid: false, reason: "compaction-output-trivial" }
  }

  const nonMetricsBlocks = context.filter((block) => !block.includes("## SWE Sworm Plugin Metrics"))
  const hasMeaningfulBlock = nonMetricsBlocks.some((block) => block.trim().length >= MIN_TOTAL_CHARS)
  if (!hasMeaningfulBlock) {
    return { valid: false, reason: "compaction-output-metrics-only" }
  }

  return { valid: true, reason: "ok" }
}
