import { describe, expect, it } from "vitest"
import { GOVERNANCE_EVAL_SCENARIOS } from "../../src/benchmark/eval-scenarios.js"
import { runEvalScenarios } from "../../src/benchmark/eval-harness.js"
import { compressContextBlocks } from "../../src/context/compression.js"
import { rankContextBlocks, budgetContextBlocks } from "../../src/context/ranker.js"
import { recoverContextBlocks } from "../../src/context/recovery.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../src/policy/defaults.js"

type ReplayCommit = {
  sha: string
  maxLines: number
  maxBlocks: number
  charBudget: number
}

type ReplayResult = {
  sha: string
  tokenUsage: number
  passRate: number
  runtimeMs: number
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function replayScenario(commit: ReplayCommit, benchmarkSet: string[]): ReplayResult {
  const start = Number(process.hrtime.bigint()) / 1_000_000
  const ranked = rankContextBlocks(benchmarkSet, ["policy", "plan", "delegation"])
  const budgeted = budgetContextBlocks(ranked, commit.maxBlocks)
  const compressed = compressContextBlocks(budgeted, commit.maxLines)
  const recovered = recoverContextBlocks(compressed.blocks, commit.charBudget)
  const payload = recovered.blocks.join("\n")
  const tokens = estimateTokens(payload)

  const quality = runEvalScenarios(
    GOVERNANCE_EVAL_SCENARIOS,
    { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: false }
  )

  const runtimeMs = Number(process.hrtime.bigint()) / 1_000_000 - start
  return {
    sha: commit.sha,
    tokenUsage: tokens,
    passRate: quality.passRate,
    runtimeMs,
  }
}

function detectCostOnlyRegressions(results: ReplayResult[]): string[] {
  const regressions: string[] = []
  for (let i = 1; i < results.length; i += 1) {
    const prev = results[i - 1]
    const curr = results[i]
    if (curr.tokenUsage > prev.tokenUsage && curr.passRate <= prev.passRate) {
      regressions.push(curr.sha)
    }
  }
  return regressions
}

describe("token efficiency replay", () => {
  it("tracks trend per commit and flags cost-only regressions", () => {
    const longWorkflow = Array.from({ length: 80 }, (_, i) => `- workflow-step-${i}: validate and summarize`).join("\n")
    const benchmarkSet = [
      "## Context (core)\nPolicy summary and governance checks for tool execution path.",
      "## Context (project)\nPlan-first guidance with approval and delegation signals.",
      `## Context (workflow)\nVerification and second-opinion workflow notes for risky mutations.\n${longWorkflow}`,
      "## Context (domain)\nMutation clustering and report formatting constraints.",
    ]

    const commits: ReplayCommit[] = [
      { sha: "sha-a1", maxLines: 32, maxBlocks: 4, charBudget: 1600 },
      { sha: "sha-b2", maxLines: 60, maxBlocks: 4, charBudget: 2400 },
      { sha: "sha-c3", maxLines: 24, maxBlocks: 3, charBudget: 1200 },
    ]

    const firstRun = commits.map((commit) => replayScenario(commit, benchmarkSet))
    const secondRun = commits.map((commit) => replayScenario(commit, benchmarkSet))

    expect(firstRun.map((r) => ({ sha: r.sha, tokenUsage: r.tokenUsage, passRate: r.passRate }))).toEqual(
      secondRun.map((r) => ({ sha: r.sha, tokenUsage: r.tokenUsage, passRate: r.passRate }))
    )

    for (const result of firstRun) {
      expect(result.tokenUsage).toBeGreaterThan(0)
      expect(result.passRate).toBeGreaterThanOrEqual(0)
      expect(result.passRate).toBeLessThanOrEqual(1)
      expect(result.runtimeMs).toBeGreaterThanOrEqual(0)
      expect(result.runtimeMs).toBeLessThan(50)
    }

    const regressions = detectCostOnlyRegressions(firstRun)
    expect(regressions).toContain("sha-b2")
    expect(regressions).not.toContain("sha-c3")

    expect(firstRun[0].sha).toBe("sha-a1")
    expect(firstRun[1].sha).toBe("sha-b2")
    expect(firstRun[2].sha).toBe("sha-c3")
  })
})
