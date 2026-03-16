import type { PluginInput } from "@opencode-ai/plugin"
import { RunLedger } from "./audit/run-ledger.js"
import { resolveFeatureFlags } from "./compat/features.js"
import { DEFAULTS, getConfig, parseDuration, setConfig } from "./config.js"
import { createPolicyRuntime } from "./create-policy.js"
import { DelegationRuntime, type RuntimeClient } from "./delegation/runtime.js"
import { cleanupDelegations, DEFAULT_DELEGATION_TTL_MS } from "./delegation/store.js"
import { createBoundedDelegationRuntime } from "./orchestrator/delegation.js"
import { loadProjectPluginConfig } from "./sdk/config-loader.js"
import { loadAvailableAgents } from "./sdk/governance-insights.js"
import { reconcileOrphanDelegations, restoreRunLedgerSnapshot } from "./session/recovery.js"
import { SkillsRegistry } from "./skills/registry.js"
import { loadSkillsFromDirectory } from "./skills/loader.js"
import { cleanupThoughts, DEFAULT_THOUGHT_TTL_MS } from "./thoughts/store.js"
import { CompactionRescueCache } from "./context/compaction-rescue.js"
import { AutopilotController } from "./autopilot/controller.js"

export async function createPluginState(input: Pick<PluginInput, "client" | "directory" | "worktree" | "project" | "serverUrl">) {
  const sessionMetrics = {
    toolCalls: 0,
    filesModified: 0,
    startTime: Date.now(),
    toolUsage: new Map<string, number>(),
    largeDiffDetected: false,
    failedVerificationCount: 0,
    secondOpinionRequests: 0,
    secondOpinionCacheHits: 0,
    secondOpinionEscalations: 0,
    adaptiveStrictness: "relaxed" as const,
  }

  const blockedCalls = new Set<string>()
  const delegationBlockedMessages = new Map<string, string>()
  const policyBlockedMessages = new Map<string, string>()
  const budgetBlockedMessages = new Map<string, string>()
  const toolsAllowedWhileDelegating = new Set<string>(["approval", "delegation_status"])
  const runLedger = new RunLedger()

  const projectConfig = await loadProjectPluginConfig(input.client, input.directory)
  setConfig(projectConfig)

  const storageConfig = getConfig().storage
  const featureFlags = resolveFeatureFlags()
  const delegationTtl = parseDuration(storageConfig?.delegationsTTL, parseDuration(DEFAULTS.storage.delegationsTTL, DEFAULT_DELEGATION_TTL_MS))
  const thoughtsTtl = parseDuration(storageConfig?.thoughtsTTL, parseDuration(DEFAULTS.storage.thoughtsTTL, DEFAULT_THOUGHT_TTL_MS))
  const approvalTtlMs = getConfig().approval?.ttlMs ?? DEFAULTS.approval.ttlMs
  const approvalDefaultReason = getConfig().approval?.defaultReason ?? DEFAULTS.approval.defaultReason

  const { strictPolicy, governanceMetadata } = createPolicyRuntime({
    strictControlConfig: getConfig().strictControl,
    worktree: input.worktree,
    projectID: input.project.id,
    serverUrl: input.serverUrl.toString(),
  })

  const delegationRuntime = featureFlags.enableDelegationRuntime
    ? createBoundedDelegationRuntime(new DelegationRuntime(input.client as RuntimeClient, input.directory), {
        maxConcurrentPerParent: getConfig().routing?.maxParallelDelegations ?? DEFAULTS.routing.maxParallelDelegations,
        maxDepth: getConfig().strictControl?.delegationMaxDepth ?? DEFAULTS.strictControl.delegationMaxDepth,
        maxNodesPerChain: getConfig().strictControl?.delegationMaxNodesPerChain ?? DEFAULTS.strictControl.delegationMaxNodesPerChain,
        returnDeadlineMs: getConfig().strictControl?.delegationReturnDeadlineMs ?? DEFAULTS.strictControl.delegationReturnDeadlineMs,
      })
    : null

  const availableAgents = await loadAvailableAgents(input.client).catch(() => new Set<string>())

  await cleanupDelegations(input.directory, delegationTtl).catch(() => undefined)
  await cleanupThoughts(input.directory, thoughtsTtl).catch(() => undefined)
  await restoreRunLedgerSnapshot(input.directory, runLedger).catch(() => undefined)
  await reconcileOrphanDelegations(input.directory, delegationTtl).catch(() => undefined)

  const skillsRegistry = new SkillsRegistry()
  skillsRegistry.register({
    name: "governance-review",
    description: "Review planned changes against strict governance rules.",
    prompt: "Review this plan for redline, budget, and approval risks before implementation.",
  })
  skillsRegistry.register({
    name: "safe-refactor",
    description: "Generate a dry-run-first refactor execution checklist.",
    prompt: "Create a dry-run refactor checklist with verification evidence requirements.",
    riskLevel: "medium",
  })
  skillsRegistry.register({
    name: "dependency-audit",
    description: "Analyze dependency graph for security and license risk.",
    prompt: "Enumerate risky dependencies, affected paths, and remediation order.",
    riskLevel: "low",
  })
  skillsRegistry.register({
    name: "test-gap-finder",
    description: "Identify likely untested paths in changed modules.",
    prompt: "List uncovered branches and propose high-signal tests with expected assertions.",
    riskLevel: "low",
  })
  skillsRegistry.register({
    name: "migration-planner",
    description: "Build migration plan with rollback checkpoints.",
    prompt: "Create an incremental migration plan with compatibility checks and rollback gates.",
    riskLevel: "medium",
  })
  skillsRegistry.register({
    name: "code-review-checklist",
    description: "Generate governance-aware review checklist.",
    prompt: "Provide a review checklist covering policy, security, testing, and release safety.",
    riskLevel: "low",
  })

  const skillsConfig = getConfig().skills
  const shouldLoadDirectorySkills = (skillsConfig?.enabled ?? DEFAULTS.skills.enabled) &&
    (skillsConfig?.loadFromDirectory ?? DEFAULTS.skills.loadFromDirectory)
  if (shouldLoadDirectorySkills) {
    await loadSkillsFromDirectory(
      input.directory,
      skillsRegistry,
      skillsConfig?.directory ?? DEFAULTS.skills.directory
    ).catch(() => 0)
  }

  const compactionRescueCache = featureFlags.enableCompactionRescue
    ? new CompactionRescueCache()
    : null

  const secondOpinionConfig = {
    enabled: getConfig().secondOpinion?.enabled ?? DEFAULTS.secondOpinion.enabled,
    minMutationsBeforeTrigger:
      getConfig().secondOpinion?.minMutationsBeforeTrigger ?? DEFAULTS.secondOpinion.minMutationsBeforeTrigger,
    tier1TimeoutMs: getConfig().secondOpinion?.tier1TimeoutMs ?? DEFAULTS.secondOpinion.tier1TimeoutMs,
    tier2TimeoutMs: getConfig().secondOpinion?.tier2TimeoutMs ?? DEFAULTS.secondOpinion.tier2TimeoutMs,
    tier1Agent: getConfig().secondOpinion?.tier1Agent ?? DEFAULTS.secondOpinion.tier1Agent,
    tier2Agent: getConfig().secondOpinion?.tier2Agent ?? DEFAULTS.secondOpinion.tier2Agent,
    escalateConfidenceThreshold:
      getConfig().secondOpinion?.escalateConfidenceThreshold ?? DEFAULTS.secondOpinion.escalateConfidenceThreshold,
    maxEscalationsPerSession:
      getConfig().secondOpinion?.maxEscalationsPerSession ?? DEFAULTS.secondOpinion.maxEscalationsPerSession,
  }

  const autopilotConfig = getConfig().autopilot ?? DEFAULTS.autopilot
  const mode = getConfig().mode ?? DEFAULTS.mode
  const autopilotController = mode === "autopilot"
    ? new AutopilotController(
        autopilotConfig.cumulativeRiskThreshold ?? DEFAULTS.autopilot.cumulativeRiskThreshold,
        autopilotConfig.maxStepsBeforePause ?? DEFAULTS.autopilot.maxStepsBeforePause,
      )
    : null

  return {
    sessionMetrics,
    blockedCalls,
    delegationBlockedMessages,
    policyBlockedMessages,
    budgetBlockedMessages,
    toolsAllowedWhileDelegating,
    runLedger,
    featureFlags,
    approvalTtlMs,
    approvalDefaultReason,
    strictPolicy,
    governanceMetadata,
    delegationRuntime,
    availableAgents,
    skillsRegistry,
    compactionRescueCache,
    secondOpinionConfig,
    autopilotController,
  }
}
