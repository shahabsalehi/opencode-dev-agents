import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { describe, expect, it } from "vitest"
import { createGovernanceTools } from "../../../src/create-governance-tools.js"
import { RunLedger } from "../../../src/audit/run-ledger.js"
import { SkillsRegistry } from "../../../src/skills/registry.js"
import { DEFAULT_STRICT_CONTROL_POLICY } from "../../../src/policy/defaults.js"
import { setConfig } from "../../../src/config.js"

function createContext(directory: string, sessionID: string) {
  return {
    directory,
    sessionID,
    messageID: `msg-${sessionID}`,
    agent: "build",
    worktree: directory,
    abort: new AbortController().signal,
    metadata: () => undefined,
    ask: async () => undefined,
  }
}

describe("create governance tools", () => {
  it("supports approval and delegation lifecycle tools", async () => {
    setConfig({ skills: { enabled: true, allowlist: ["safe-refactor"] } })

    const directory = await mkdtemp(join(tmpdir(), "swe-tools-"))
    const runLedger = new RunLedger()
    const skillsRegistry = new SkillsRegistry()
    skillsRegistry.register({
      name: "safe-refactor",
      description: "d",
      prompt: "dry-run checklist",
    })

    const tools = createGovernanceTools({
      runLedger,
      skillsRegistry,
      strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: false },
      sessionMetrics: {
        toolCalls: 0,
        filesModified: 0,
        largeDiffDetected: false,
        failedVerificationCount: 0,
        adaptiveStrictness: "normal",
      },
      availableAgents: new Set(["build"]),
      delegationRuntime: null,
      approvalTtlMs: 60_000,
      approvalDefaultReason: "manual",
    })

    const sessionID = `ses-tools-${Date.now()}`
    const context = createContext(directory, sessionID)

    const approvalList = await tools.approval.execute({ action: "list" }, context)
    expect(String(approvalList)).toContain("No pending approvals")

    const approveAll = await tools.approval.execute({ action: "approveAll" }, context)
    expect(String(approveAll)).toContain("Approved")

    const approveMissingCall = await tools.approval.execute({ action: "approve" }, context)
    expect(String(approveMissingCall)).toContain("callID is required")

    const delegated = await tools.delegate.execute({ prompt: "find bug", agent: "build" }, context)
    expect(String(delegated)).toContain("Delegation recorded")

    const delegationList = await tools.delegation_list.execute({}, context)
    expect(String(delegationList)).toContain("del_")

    const status = await tools.delegation_status.execute({}, context)
    expect(String(status)).toContain("pendingOrRunningRecords")

    const listLines = String(delegationList).split("\n")
    const delegationId = listLines[0].split(" ")[1]
    const readDelegation = await tools.delegation_read.execute({ id: delegationId }, context)
    expect(String(readDelegation)).toContain(delegationId)

    const updatedDelegation = await tools.delegation_update.execute(
      { id: delegationId, status: "completed", result: "ok" },
      context
    )
    expect(String(updatedDelegation)).toContain("Delegation updated")

    const thoughtSaved = await tools.thought_log.execute({ title: "Decision", content: "Use strict mode" }, context)
    expect(String(thoughtSaved)).toContain("Saved thought")

    const thoughtList = await tools.thought_list.execute({}, context)
    expect(String(thoughtList)).toContain("thought_")

    const route = await tools.route_task.execute({ prompt: "optimize API" }, context)
    expect(String(route)).toContain("category")

    const skills = await tools.skill_list.execute({}, context)
    expect(String(skills)).toContain("safe-refactor")

    const executed = await tools.skill_execute.execute({ name: "safe-refactor" }, context)
    expect(String(executed)).toContain("dry-run")

    const report = await tools.governance_report.execute({}, context)
    expect(String(report)).toContain("sessionID")

    const hud = await tools.session_hud.execute({}, context)
    expect(String(hud)).toContain("Session HUD")

    const autopilotStatus = await tools.autopilot_status.execute({}, context)
    expect(String(autopilotStatus)).toContain("Autopilot is not active")

    const scorecard = await tools.governance_scorecard.execute({}, context)
    expect(String(scorecard)).toContain("scores")

    const evalSummary = await tools.governance_eval.execute({}, context)
    expect(String(evalSummary)).toContain("passRate")

    const normalized = await tools.tool_result_normalize.execute({ tool: "read", output: "ok" }, context)
    expect(String(normalized)).toContain("status")

    const cluster = await tools.mutation_cluster_plan.execute({ files: ["src/a.ts", "src/b.ts", "tests/a.test.ts"] }, context)
    expect(String(cluster)).toContain("clusters")

    const bundles = await tools.mcp_bundle_list.execute({}, context)
    expect(String(bundles)).toContain("github-core")

    const bundleConfig = await tools.mcp_bundle_generate.execute({ bundle: "full-engineering" }, context)
    expect(String(bundleConfig)).toContain("playwright")

    const handoff = await tools.continuation_handoff.execute({}, context)
    expect(String(handoff)).toContain("Continuation Handoff")

    const onboarding = await tools.pattern_onboard.execute(
      {
        projectName: "governed-app",
        stack: ["TypeScript", "Node"],
        enforceApproval: true,
      },
      context
    )
    expect(String(onboarding)).toContain("approval-gate")

    const contextPack = await tools.context_pack_generate.execute(
      {
        teamName: "Platform",
        projectName: "governed-app",
      },
      context
    )
    expect(String(contextPack)).toContain(".opencode/context/governed-app")

    const denyMissingCall = await tools.approval.execute({ action: "deny", callID: "missing" }, context)
    expect(String(denyMissingCall)).toContain("No pending approval")

    await rm(directory, { recursive: true, force: true })
  })

  it("handles unknown skill and scout fallback", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swe-tools-"))
    const tools = createGovernanceTools({
      runLedger: new RunLedger(),
      skillsRegistry: new SkillsRegistry(),
      strictPolicy: { ...DEFAULT_STRICT_CONTROL_POLICY, recordOnly: false },
      sessionMetrics: {
        toolCalls: 0,
        filesModified: 0,
        largeDiffDetected: false,
        failedVerificationCount: 0,
        adaptiveStrictness: "normal",
      },
      availableAgents: new Set(),
      delegationRuntime: null,
      approvalTtlMs: 60_000,
      approvalDefaultReason: "manual",
    })

    setConfig({ skills: { enabled: true, allowlist: [] } })
    const context = createContext(directory, `ses-tools-${Date.now()}`)
    const unknownSkill = await tools.skill_execute.execute({ name: "missing" }, context)
    expect(String(unknownSkill)).toContain("Unknown skill")

    const scout = await tools.external_scout.execute({ query: "x", maxChars: 2000 }, context)
    expect(String(scout)).toContain("No snippets provided")

    const scoutSummary = await tools.external_scout.execute({ query: "x", snippets: ["a", "b"], maxChars: 2000 }, context)
    expect(String(scoutSummary)).toContain("Source 1")

    await rm(directory, { recursive: true, force: true })
  })
})
