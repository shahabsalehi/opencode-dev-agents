import type { Hooks, Plugin } from "@opencode-ai/plugin"
import { approvalStore } from "./approval-gates.js"
import { readSessionDiffSummary, readTodoPressure } from "./sdk/governance-insights.js"
import { createCoreToolRegistry } from "./create-tools.js"
import { createGovernanceHooks } from "./create-hooks.js"
import { createPluginInterface } from "./plugin-interface.js"
import { saveRunLedgerSnapshot } from "./session/recovery.js"
import { createGovernanceTools } from "./create-governance-tools.js"
import { createExecutionHooks } from "./create-execution-hooks.js"
import { createSessionLifecycleHooks } from "./create-session-lifecycle.js"
import { createPluginState } from "./create-plugin-state.js"
import { DEFAULTS, getConfig } from "./config.js"
import { listThoughts } from "./thoughts/store.js"
import { requestSecondOpinion } from "./opinion/request.js"

const plugin: Plugin = async ({ client, directory, worktree, project, serverUrl }): Promise<Hooks> => {
  const state = await createPluginState({
    client,
    directory,
    worktree,
    project,
    serverUrl,
  })

  const governanceHooks = createGovernanceHooks({
    strictPolicy: state.strictPolicy,
    runLedger: state.runLedger,
    directory,
    governanceMetadata: state.governanceMetadata,
    approvalStore,
    client,
    enableChatMessagesTransform: state.featureFlags.enableChatMessagesTransform,
    enableTextCompleteHook: state.featureFlags.enableTextCompleteHook,
  })

  const governanceTools = createGovernanceTools({
    runLedger: state.runLedger,
    skillsRegistry: state.skillsRegistry,
    strictPolicy: state.strictPolicy,
    sessionMetrics: state.sessionMetrics,
    availableAgents: state.availableAgents,
    delegationRuntime: state.delegationRuntime,
    approvalTtlMs: state.approvalTtlMs,
    approvalDefaultReason: state.approvalDefaultReason,
    autopilotController: state.autopilotController,
  })

  const executionHooks = createExecutionHooks({
    client,
    directory,
    runLedger: state.runLedger,
    strictPolicy: state.strictPolicy,
    governanceMetadata: state.governanceMetadata,
    toolsAllowedWhileDelegating: state.toolsAllowedWhileDelegating,
    blockedCalls: state.blockedCalls,
    delegationBlockedMessages: state.delegationBlockedMessages,
    policyBlockedMessages: state.policyBlockedMessages,
    budgetBlockedMessages: state.budgetBlockedMessages,
    sessionMetrics: state.sessionMetrics,
    featureFlags: state.featureFlags,
    approvalTtlMs: state.approvalTtlMs,
    approvalDefaultReason: state.approvalDefaultReason,
    delegationRuntime: state.delegationRuntime,
    readSessionDiffSummary: (sessionID) => readSessionDiffSummary(client, sessionID, directory).catch(() => null),
    readTodoPressure: (sessionID) => readTodoPressure(client, sessionID, directory).catch(() => null),
    saveRunLedgerSnapshot: () => saveRunLedgerSnapshot(directory, state.runLedger).catch(() => undefined),
    planFirstConfig: {
      enabled: getConfig().planFirst?.enabled ?? DEFAULTS.planFirst.enabled,
      maxPlanAgeMs: getConfig().planFirst?.maxPlanAgeMs ?? DEFAULTS.planFirst.maxPlanAgeMs,
    },
    listThoughts: () => listThoughts(directory),
    availableAgents: state.availableAgents,
    secondOpinionConfig: state.secondOpinionConfig,
    autopilotController: state.autopilotController,
    requestSecondOpinion: ({ request, agent, timeoutMs, tier }) =>
      requestSecondOpinion({
        client,
        request,
        agent,
        timeoutMs,
        tier,
      }),
  })

  const lifecycleHooks = createSessionLifecycleHooks({
    directory,
    runLedger: state.runLedger,
    sessionMetrics: state.sessionMetrics,
    featureFlags: state.featureFlags,
    delegationRuntime: state.delegationRuntime,
    compactionRescueCache: state.compactionRescueCache,
  })

  const tools = {
    ...createCoreToolRegistry(),
    ...governanceTools,
  }

  const hooks = createPluginInterface({
    tools,
    hooks: {
      ...governanceHooks,
      ...executionHooks,
      ...lifecycleHooks,
    },
  })

  return hooks
}

export default plugin
