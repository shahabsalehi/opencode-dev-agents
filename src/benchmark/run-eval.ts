import { createPolicyRuntime } from "../create-policy.js"
import { runEvalScenarios } from "./eval-harness.js"
import { GOVERNANCE_EVAL_SCENARIOS } from "./eval-scenarios.js"

const { strictPolicy } = createPolicyRuntime({
  strictControlConfig: {
    enabled: true,
    enforceRedlines: true,
    recordOnly: false,
  },
  worktree: process.cwd(),
  projectID: "eval",
  serverUrl: "http://localhost",
})

const summary = runEvalScenarios(GOVERNANCE_EVAL_SCENARIOS, strictPolicy)
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)

if (summary.passRate < 0.9) {
  process.stderr.write(`❌ Eval pass rate ${(summary.passRate * 100).toFixed(1)}% < 90% threshold\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`✅ Eval pass rate ${(summary.passRate * 100).toFixed(1)}%\n`)
}
