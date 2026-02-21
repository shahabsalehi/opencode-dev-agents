import { validateToolOutput } from "../validation/schema.js"

export type VerificationVerdict = "pass" | "needs-review" | "blocked"

export type VerificationResult = {
  verdict: VerificationVerdict
  reason: string
}

const MUTATION_TOOLS = new Set(["edit", "write", "bash", "testGenerator", "refactorEngine", "apply_patch"])

type VerificationEvidence = {
  typecheck?: boolean
  tests?: boolean
  build?: boolean
}

function extractEvidence(args: Record<string, unknown> | undefined): VerificationEvidence | null {
  const value = args?.verificationEvidence
  if (!value || typeof value !== "object") {
    return null
  }

  const evidence = value as Record<string, unknown>
  return {
    typecheck: evidence.typecheck === true,
    tests: evidence.tests === true,
    build: evidence.build === true,
  }
}

function safeParseJson(value: unknown): unknown {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function evaluateVerificationContract(
  toolName: string,
  args: Record<string, unknown> | undefined,
  rawOutput: unknown
): VerificationResult {
  const parsed = safeParseJson(rawOutput)

  if (toolName === "reviewTool") {
    if (typeof parsed !== "object" || parsed === null) {
      return { verdict: "needs-review", reason: "review-output-not-json" }
    }
    if (!validateToolOutput(parsed)) {
      return { verdict: "needs-review", reason: "review-output-invalid" }
    }
    const summary = (parsed as { summary?: Record<string, unknown> }).summary
    if (summary?.overallVerdict === "trusted") {
      return { verdict: "pass", reason: "trusted-review" }
    }
    return { verdict: "needs-review", reason: "review-verdict-not-trusted" }
  }

  if (toolName === "codeAnalyzer" || toolName === "bugDetector") {
    if (typeof parsed !== "object" || parsed === null || !validateToolOutput(parsed)) {
      return { verdict: "needs-review", reason: "analysis-output-invalid" }
    }
    return { verdict: "pass", reason: "analysis-schema-valid" }
  }

  if (MUTATION_TOOLS.has(toolName)) {
    const explicitBypass = args?.verification === "skip"
    if (explicitBypass) {
      return { verdict: "needs-review", reason: "mutation-verification-skipped" }
    }

    const evidence = extractEvidence(args)
    const hasCompleteEvidence = evidence?.typecheck === true && evidence.tests === true && evidence.build === true
    if (hasCompleteEvidence) {
      return { verdict: "pass", reason: "mutation-verification-evidence-complete" }
    }

    return {
      verdict: "needs-review",
      reason: "mutation-evidence-required:typecheck+tests+build",
    }
  }

  return { verdict: "pass", reason: "no-contract-required" }
}
