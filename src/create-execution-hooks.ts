import { approvalStore } from "./approval-gates.js"
import { appendAuditEntry } from "./audit/logger.js"
import { evaluateBudgetGate, shouldBlockForBudget } from "./policy/budgets.js"
import { enforcePolicyBefore, shouldRequireApproval } from "./policy/enforce.js"
import { shouldTrackMutation } from "./policy/mutation-tools.js"
import { evaluateVerificationContract } from "./verify/contract.js"
import { DEFAULTS, getConfig } from "./config.js"
import type { RunLedger } from "./audit/run-ledger.js"
import type { StrictControlPolicy } from "./policy/types.js"
import { evaluatePlanEvidence, requiresPlan, type PlanFirstConfig } from "./plan/plan-contract.js"
import type { ThoughtRecord } from "./thoughts/store.js"
import type { OpinionTier, SecondOpinionConfig, SecondOpinionRequest, SecondOpinionResponse } from "./opinion/types.js"
import { computePlanHash, shouldRequestSecondOpinion } from "./opinion/trigger.js"
import { opinionCache } from "./opinion/opinion-cache.js"
import {
  guidanceForApprovalBlock,
  guidanceForBudgetAdvisory,
  guidanceForBudgetBlock,
  guidanceForDelegationPending,
  guidanceForPlanFirst,
  guidanceForPolicyBlock,
} from "./execution/failure-guidance.js"
import { evaluateDiffQuality } from "./quality/diff-checks.js"
import { normalizeToolOutput } from "./normalization/tool-output.js"
import { evaluateAdaptiveStrictness } from "./policy/adaptive.js"
import type { AdaptiveStrictnessLevel } from "./policy/types.js"
import type { AutopilotController } from "./autopilot/controller.js"
import { computeStepRisk } from "./autopilot/risk-accumulator.js"

type DelegationRuntimeLike = {
  hasPendingForParent(parentSessionID: string): boolean
  getActiveCountForParent(parentSessionID: string): number
}

export function createExecutionHooks(input: {
  client: {
    app: {
      log(args: {
        body: {
          service: string
          level: "debug" | "info" | "warn" | "error"
          message: string
          extra?: Record<string, unknown>
        }
      }): Promise<unknown>
    }
  }
  directory: string
  runLedger: RunLedger
  strictPolicy: StrictControlPolicy
  governanceMetadata: {
    worktree: string
    projectID: string
    serverUrl: string
  }
  toolsAllowedWhileDelegating: Set<string>
  blockedCalls: Set<string>
  delegationBlockedMessages: Map<string, string>
  policyBlockedMessages: Map<string, string>
  budgetBlockedMessages: Map<string, string>
  sessionMetrics: {
    toolCalls: number
    filesModified: number
    startTime: number
    toolUsage: Map<string, number>
    largeDiffDetected: boolean
    failedVerificationCount: number
    secondOpinionRequests: number
    secondOpinionCacheHits: number
    secondOpinionEscalations: number
    adaptiveStrictness: AdaptiveStrictnessLevel
  }
  featureFlags: {
    enableVerificationContract: boolean
  }
  approvalTtlMs: number
  approvalDefaultReason: string
  delegationRuntime: DelegationRuntimeLike | null
  readSessionDiffSummary(sessionID: string): Promise<{ files: number; additions: number; deletions: number } | null>
  readTodoPressure(sessionID: string): Promise<{ pending: number; inProgress: number; total: number } | null>
  saveRunLedgerSnapshot(): Promise<void>
  planFirstConfig: PlanFirstConfig
  listThoughts: () => Promise<ThoughtRecord[]>
  availableAgents: Set<string>
  secondOpinionConfig: SecondOpinionConfig
  requestSecondOpinion(input: {
    request: SecondOpinionRequest
    agent: string
    timeoutMs: number
    tier: OpinionTier
  }): Promise<SecondOpinionResponse>
  autopilotController?: AutopilotController | null
}) {
  const autopilotController = input.autopilotController ?? null
  return {
    "tool.execute.before": async (
      hookInput: { tool?: string; sessionID?: string; callID?: string },
      hookOutput: { args?: Record<string, unknown>; output?: unknown; metadata?: Record<string, unknown> }
    ) => {
      try {
        const toolName = hookInput.tool
        const sessionID = hookInput.sessionID
        const callID = hookInput.callID
        const args = hookOutput.args

        if (!toolName) {
          return
        }

        if (sessionID) {
          input.runLedger.recordToolCall(sessionID)
        }

        if (
          autopilotController &&
          sessionID &&
          toolName !== "approval" &&
          shouldTrackForAutopilot(toolName, args)
        ) {
          if (autopilotController.shouldPause(sessionID)) {
            if (callID && !approvalStore.isApproved(sessionID, callID)) {
              approvalStore.requestApproval(
                sessionID,
                callID,
                toolName,
                args || {},
                {
                  riskLevel: "high",
                  policyReason: "autopilot-cumulative-risk",
                }
              )
              input.blockedCalls.add(callID)
              hookOutput.args = undefined
              hookOutput.output = guidanceForApprovalBlock(toolName, callID)
              hookOutput.metadata = {
                ...hookOutput.metadata,
                autopilotPaused: true,
              }
              return
            }
          }
        }

        input.sessionMetrics.toolCalls++
        input.sessionMetrics.toolUsage.set(
          toolName,
          (input.sessionMetrics.toolUsage.get(toolName) || 0) + 1
        )

        const adaptiveStrictness = resolveAdaptiveStrictness(input, toolName)
        input.sessionMetrics.adaptiveStrictness = adaptiveStrictness

        await input.client.app.log({
          body: {
            service: "swe-sworm-plugin",
            level: "debug",
            message: "Executing tool",
            extra: { tool: toolName, callID, sessionID }
          }
        })

        if (
          input.delegationRuntime &&
          sessionID &&
          callID &&
          input.delegationRuntime.hasPendingForParent(sessionID) &&
          !input.toolsAllowedWhileDelegating.has(toolName)
        ) {
          const pendingCount = input.delegationRuntime.getActiveCountForParent(sessionID)
          const message = guidanceForDelegationPending(pendingCount)
          input.delegationBlockedMessages.set(callID, message)
          hookOutput.args = undefined
          return
        }

        let thoughts: ThoughtRecord[] | null = null
        if (input.planFirstConfig.enabled && toolName && requiresPlan(toolName)) {
          thoughts = await input.listThoughts()
          const evidence = evaluatePlanEvidence(thoughts, input.planFirstConfig)
          if (!evidence.hasPlan) {
            const reason = evidence.planAge !== null
              ? `Plan "${evidence.planTitle}" is stale (${Math.round((evidence.planAge ?? 0) / 60000)}m old). Log a fresh plan with title prefix \"plan:\".`
              : `No plan found. Before using ${toolName}, log a thought with title prefix \"plan:\".`
            hookOutput.output = guidanceForPlanFirst(toolName, reason)
            hookOutput.metadata = {
              ...hookOutput.metadata,
              planFirstBlocked: true,
            }
            hookOutput.args = undefined
            return
          }
        }

        if (toolName && sessionID) {
          const risk = isHighRiskMutationTool(toolName) ? "high" : "medium"
          const shouldRequest = shouldRequestSecondOpinion({
            config: input.secondOpinionConfig,
            toolName,
            risk,
            filesModified: input.sessionMetrics.filesModified,
            planBlocked: false,
            operatorMode: getConfig().mode ?? DEFAULTS.mode,
          })

          if (shouldRequest) {
            const records = thoughts ?? await input.listThoughts()
            const plan = findLatestPlanThought(records)

            if (plan) {
              const planHash = computePlanHash(plan.title, plan.content, toolName)
              const cacheKey = `${sessionID}:${planHash}`
              const cached = opinionCache.get(cacheKey)?.value

              let finalOpinion: SecondOpinionResponse | null = null
              if (cached) {
                finalOpinion = cached
                input.sessionMetrics.secondOpinionCacheHits++
                await appendAuditEntry(input.directory, {
                  timestamp: new Date().toISOString(),
                  sessionID,
                  callID,
                  action: "second-opinion.cache-hit",
                  status: "info",
                  tool: toolName,
                  details: {
                    verdict: finalOpinion.verdict,
                    tier: finalOpinion.reviewerTier,
                  },
                })
              } else {
                const request: SecondOpinionRequest = {
                  planTitle: plan.title,
                  planContent: plan.content,
                  toolName,
                  toolArgs: args,
                  sessionID,
                  mutationCount: input.sessionMetrics.filesModified,
                  policyRisk: risk,
                }

                input.sessionMetrics.secondOpinionRequests++
                const tier1Agent = input.availableAgents.has(input.secondOpinionConfig.tier1Agent)
                  ? input.secondOpinionConfig.tier1Agent
                  : (input.availableAgents.has("explore") ? "explore" : input.secondOpinionConfig.tier1Agent)
                const tier1 = await input.requestSecondOpinion({
                  request,
                  agent: tier1Agent,
                  timeoutMs: input.secondOpinionConfig.tier1TimeoutMs,
                  tier: "lightweight",
                })

                finalOpinion = tier1

                if (tier1.verdict === "escalate") {
                  if (
                    tier1.confidence < input.secondOpinionConfig.escalateConfidenceThreshold ||
                    input.sessionMetrics.secondOpinionEscalations >= input.secondOpinionConfig.maxEscalationsPerSession
                  ) {
                    finalOpinion = { ...tier1, verdict: "caution" }
                  } else {
                    input.sessionMetrics.secondOpinionEscalations++
                    const tier2Agent = input.secondOpinionConfig.tier2Agent
                    if (input.availableAgents.has(tier2Agent)) {
                      finalOpinion = await input.requestSecondOpinion({
                        request,
                        agent: tier2Agent,
                        timeoutMs: input.secondOpinionConfig.tier2TimeoutMs,
                        tier: "strong",
                      })
                    } else {
                      finalOpinion = { ...tier1, verdict: "caution" }
                    }
                  }
                }

                opinionCache.set(cacheKey, { value: finalOpinion })

                await appendAuditEntry(input.directory, {
                  timestamp: new Date().toISOString(),
                  sessionID,
                  callID,
                  action: "second-opinion.review",
                  status: finalOpinion.verdict === "escalate" ? "ask" : "allow",
                  tool: toolName,
                  details: {
                    verdict: finalOpinion.verdict,
                    tier: finalOpinion.reviewerTier,
                    confidence: finalOpinion.confidence,
                    risks: finalOpinion.risks,
                  },
                })
              }

              hookOutput.metadata = {
                ...hookOutput.metadata,
                secondOpinion: finalOpinion,
              }

              if (finalOpinion.verdict === "escalate" && finalOpinion.reviewerTier === "strong" && callID) {
                approvalStore.requestApproval(
                  sessionID,
                  callID,
                  toolName,
                  args || {},
                  {
                    riskLevel: "high",
                    policyReason: `second-opinion-escalated:${finalOpinion.risks.join("; ")}`,
                  }
                )
                input.blockedCalls.add(callID)

                await appendAuditEntry(input.directory, {
                  timestamp: new Date().toISOString(),
                  sessionID,
                  callID,
                  action: "second-opinion.escalate",
                  status: "ask",
                  tool: toolName,
                  details: {
                    risks: finalOpinion.risks,
                    suggestion: finalOpinion.suggestion,
                    confidence: finalOpinion.confidence,
                  },
                })

                hookOutput.args = undefined
                hookOutput.output = guidanceForApprovalBlock(toolName, callID)
                return
              }
            }
          }
        }

        const policyResult = enforcePolicyBefore(
          { toolName, args },
          input.strictPolicy,
          input.runLedger,
          sessionID
        )

        if (sessionID && input.strictPolicy.enabled && toolName !== "approval") {
          const budgetResult = evaluateBudgetGate(
            input.runLedger.get(sessionID),
            toolName,
            args,
            input.strictPolicy.budgets
          )
          if (budgetResult.exceeded) {
            const budgetReason = budgetResult.reason || "budget-limit-exceeded"
            const enforceBudgetBlocks = (getConfig().mode ?? DEFAULTS.mode) === "strict"
            const budgetMessage = enforceBudgetBlocks
              ? guidanceForBudgetBlock(budgetReason)
              : guidanceForBudgetAdvisory(budgetReason)

            if (!enforceBudgetBlocks) {
              hookOutput.metadata = {
                ...hookOutput.metadata,
                budgetAdvisory: true,
                budgetReason,
              }
              hookOutput.output = budgetMessage
              return
            }

            if (!callID) {
              hookOutput.output = budgetMessage
              hookOutput.metadata = {
                ...hookOutput.metadata,
                budgetBlocked: true,
                budgetReason: budgetResult.reason,
              }
              hookOutput.args = undefined
              return
            }

            const scopedGranted = approvalStore.hasScopedGrant(sessionID, toolName, args)
            const approved = approvalStore.isApproved(sessionID, callID)
            if (!shouldBlockForBudget({ exceeded: budgetResult.exceeded, approved, scopedGranted })) {
              input.blockedCalls.delete(callID)
            } else if (!input.blockedCalls.has(callID)) {
              approvalStore.requestApproval(sessionID, callID, toolName, args || {}, {
                riskLevel: "high",
                policyReason: budgetResult.reason,
              })
              input.blockedCalls.add(callID)
              input.budgetBlockedMessages.set(callID, budgetMessage)
              await appendAuditEntry(input.directory, {
                timestamp: new Date().toISOString(),
                sessionID,
                callID,
                action: "policy.budget.request",
                status: "ask",
                tool: toolName,
                details: {
                  reason: budgetResult.reason,
                },
              })
            } else {
              input.budgetBlockedMessages.set(callID, budgetMessage)
            }
            if (shouldBlockForBudget({ exceeded: budgetResult.exceeded, approved, scopedGranted })) {
              hookOutput.args = undefined
              return
            }
          }
        }

        if (policyResult.blocked) {
          if (callID) {
            input.policyBlockedMessages.set(callID, guidanceForPolicyBlock(policyResult.evaluation.reason || "policy-rule"))
          }
          await appendAuditEntry(input.directory, {
            timestamp: new Date().toISOString(),
            sessionID,
            callID,
            action: "policy.block",
            status: "deny",
            tool: toolName,
            details: {
              reason: policyResult.evaluation.reason,
              risk: policyResult.evaluation.risk,
              rule: policyResult.evaluation.matchedRuleID,
            },
          })
          hookOutput.output = guidanceForPolicyBlock(policyResult.evaluation.reason || "policy-rule")
          hookOutput.metadata = {
            ...hookOutput.metadata,
            policyBlocked: true,
          }
          hookOutput.args = undefined
          return
        }

        const approvalEnforced = getConfig().approval?.enforce ?? DEFAULTS.approval.enforce
        const policyNeedsApproval = shouldRequireApproval(policyResult.evaluation)
        const adaptiveNeedsApproval =
          input.strictPolicy.adaptive.enabled &&
          isHighRiskMutationTool(toolName) &&
          (adaptiveStrictness === "elevated" || adaptiveStrictness === "lockdown")

        if ((approvalEnforced || adaptiveNeedsApproval) && (approvalStore.requiresApproval(toolName) || policyNeedsApproval || adaptiveNeedsApproval) && callID && sessionID && toolName !== "approval") {
          const scopedGranted = approvalStore.hasScopedGrant(sessionID, toolName, args)
          const isApproved = approvalStore.isApproved(sessionID, callID)

          if (input.blockedCalls.has(callID)) {
            if (scopedGranted || isApproved) {
              input.blockedCalls.delete(callID)
            } else {
              return
            }
          }

          if (scopedGranted) {
            return
          }

          if (!isApproved) {
            approvalStore.requestApproval(
              sessionID,
              callID,
              toolName,
              args || {},
              {
                riskLevel: policyResult.evaluation.risk,
                policyReason: adaptiveNeedsApproval
                  ? `adaptive-${adaptiveStrictness}:${policyResult.evaluation.reason}`
                  : policyResult.evaluation.reason,
              }
            )

            input.blockedCalls.add(callID)

            await appendAuditEntry(input.directory, {
              timestamp: new Date().toISOString(),
              sessionID,
              callID,
              action: "approval.request",
              status: "ask",
              tool: toolName,
              details: {
                args: args || {},
                adaptiveStrictness,
              }
            })

            hookOutput.args = undefined
            hookOutput.output = guidanceForApprovalBlock(toolName, callID)
          }
        }

        hookOutput.metadata = {
          ...hookOutput.metadata,
          adaptiveStrictness,
        }
      } catch (error) {
        await input.client.app.log({
          body: {
            service: "swe-sworm-plugin",
            level: "error",
            message: "Tool execution hook error",
            extra: { error: String(error) }
          }
        })
      }
    },
    "tool.execute.after": async (
      hookInput: { tool?: string; sessionID?: string; callID?: string; args?: Record<string, unknown> },
      hookOutput: { output?: unknown; title?: string; metadata?: Record<string, unknown> }
    ) => {
      try {
        const toolName = hookInput.tool
        const args = hookInput.args
        const sessionID = hookInput.sessionID

        if (hookInput.callID) {
          const budgetBlockMessage = input.budgetBlockedMessages.get(hookInput.callID)
          if (budgetBlockMessage) {
            hookOutput.output = budgetBlockMessage
            hookOutput.title = `Budget blocked`
            hookOutput.metadata = {
              ...hookOutput.metadata,
              budgetBlocked: true,
            }
            input.budgetBlockedMessages.delete(hookInput.callID)
            return
          }

          const policyBlockMessage = input.policyBlockedMessages.get(hookInput.callID)
          if (policyBlockMessage) {
            hookOutput.output = policyBlockMessage
            hookOutput.title = `Policy blocked`
            hookOutput.metadata = {
              ...hookOutput.metadata,
              policyBlocked: true,
            }
            input.policyBlockedMessages.delete(hookInput.callID)
            return
          }

          const delegationBlockMessage = input.delegationBlockedMessages.get(hookInput.callID)
          if (delegationBlockMessage) {
            hookOutput.output = delegationBlockMessage
            hookOutput.title = `Delegation in progress`
            hookOutput.metadata = {
              ...hookOutput.metadata,
              delegationBlocked: true,
            }
            input.delegationBlockedMessages.delete(hookInput.callID)
            return
          }
        }

        if (toolName && sessionID && hookInput.callID) {
          const request = approvalStore
            .getPendingApprovals(sessionID)
            .find(r => r.callID === hookInput.callID)

          if (request && request.status === "pending") {
            hookOutput.output = guidanceForApprovalBlock(request.tool, request.callID)
            hookOutput.title = `Blocked: ${toolName}`
            hookOutput.metadata = {
              ...hookOutput.metadata,
              approvalBlocked: true,
              approvalCallID: request.callID,
              approvalSessionID: request.sessionID,
              approvalTool: request.tool,
              governance: input.governanceMetadata,
            }

            return
          }
        }

        let diffSummary: { files: number; additions: number; deletions: number } | null = null
        if (toolName && sessionID && shouldTrackMutation(toolName, args)) {
          const [nextDiffSummary, todoPressure] = await Promise.all([
            input.readSessionDiffSummary(sessionID),
            input.readTodoPressure(sessionID),
          ])
          diffSummary = nextDiffSummary
          input.sessionMetrics.largeDiffDetected = Boolean(
            nextDiffSummary && (nextDiffSummary.files > 8 || (nextDiffSummary.additions + nextDiffSummary.deletions) > 350)
          )

          if (nextDiffSummary || todoPressure) {
            hookOutput.metadata = {
              ...hookOutput.metadata,
              governanceInsights: {
                diff: nextDiffSummary,
                todos: todoPressure,
              },
            }
          }

          const qualityWarnings = evaluateDiffQuality({
            toolName,
            diff: nextDiffSummary,
            verificationEvidence: args?.verificationEvidence as Record<string, unknown> | undefined,
          })
          if (qualityWarnings.length > 0) {
            hookOutput.metadata = {
              ...hookOutput.metadata,
              qualityWarnings,
            }
            const existing = typeof hookOutput.output === "string" ? hookOutput.output : ""
            hookOutput.output = `${existing}\n\nQuality checks:\n- ${qualityWarnings.join("\n- ")}`.trim()
          }
        }

        if (toolName && shouldTrackMutation(toolName, args)) {
          input.sessionMetrics.filesModified++
          if (sessionID) {
            input.runLedger.recordMutation(sessionID)
          }
          await appendAuditEntry(input.directory, {
            timestamp: new Date().toISOString(),
            sessionID,
            callID: hookInput.callID,
            action: "tool.executed",
            status: "allow",
            tool: toolName
          })

        }

        if (toolName && sessionID && autopilotController && shouldTrackForAutopilot(toolName, args)) {
          autopilotController.startStep(sessionID, toolName)
          const stepRisk = computeStepRisk({
            toolName,
            policyRisk: (toolName === "bash" || toolName === "interactive_bash" || toolName === "refactorEngine")
              ? "high"
              : "medium",
            diffSummary,
          })
          autopilotController.completeStep(sessionID, stepRisk)
          const status = autopilotController.getStatus(sessionID)
          hookOutput.metadata = {
            ...hookOutput.metadata,
            autopilot: status,
          }
        }

        if (input.featureFlags.enableVerificationContract && toolName) {
          const verification = evaluateVerificationContract(toolName, args as Record<string, unknown> | undefined, hookOutput.output)
          hookOutput.metadata = {
            ...hookOutput.metadata,
            verificationVerdict: verification.verdict,
            verificationReason: verification.reason,
          }
          const enforceOnMutation = getConfig().verification?.enforceOnMutation ?? DEFAULTS.verification.enforceOnMutation
          if (enforceOnMutation && verification.verdict === "needs-review") {
            if (shouldTrackMutation(toolName, args)) {
              input.sessionMetrics.failedVerificationCount++
            }
            const details = typeof hookOutput.output === "string" ? hookOutput.output : ""
            hookOutput.output = `${details}\n\n⚠️ Verification contract: ${verification.reason}`.trim()
          }
        }

        if (sessionID) {
          await input.saveRunLedgerSnapshot()
        }

        if (toolName) {
          hookOutput.metadata = {
            ...hookOutput.metadata,
            normalizedOutput: normalizeToolOutput(toolName, hookOutput.output, {
              approvalBlocked: hookOutput.metadata?.approvalBlocked === true,
              policyBlocked: hookOutput.metadata?.policyBlocked === true,
              budgetBlocked: hookOutput.metadata?.budgetBlocked === true,
              delegationBlocked: hookOutput.metadata?.delegationBlocked === true,
            }),
            diffSummary,
          }
        }
      } catch (error) {
        await input.client.app.log({
          body: {
            service: "swe-sworm-plugin",
            level: "error",
            message: "Tool execution after hook error",
            extra: { error: String(error) }
          }
        })
      }
    },
  }
}

function shouldTrackForAutopilot(toolName: string, args?: Record<string, unknown>): boolean {
  return toolName === "bash" || toolName === "interactive_bash" || shouldTrackMutation(toolName, args)
}

function findLatestPlanThought(records: ThoughtRecord[]): ThoughtRecord | null {
  const sorted = records
    .filter((record) => record.title.toLowerCase().startsWith("plan:"))
    .sort((a, b) => b.createdAt - a.createdAt)
  return sorted[0] ?? null
}

function isHighRiskMutationTool(toolName: string): boolean {
  return toolName === "edit" ||
    toolName === "write" ||
    toolName === "apply_patch" ||
    toolName === "bash" ||
    toolName === "interactive_bash" ||
    toolName === "refactorEngine" ||
    toolName === "testGenerator"
}

function resolveAdaptiveStrictness(
  input: {
    strictPolicy: StrictControlPolicy
    sessionMetrics: {
      filesModified: number
      toolCalls: number
      toolUsage: Map<string, number>
      largeDiffDetected: boolean
      failedVerificationCount: number
    }
  },
  toolName: string
): AdaptiveStrictnessLevel {
  if (!input.strictPolicy.adaptive.enabled || toolName === "approval") {
    return "normal"
  }

  const mutationToolCalls = Array.from(input.sessionMetrics.toolUsage.entries()).reduce((sum, [name, count]) => {
    return isHighRiskMutationTool(name) ? sum + count : sum
  }, 0)
  const ratio = mutationToolCalls > 0
    ? input.sessionMetrics.filesModified / mutationToolCalls
    : 0

  return evaluateAdaptiveStrictness({
    mutationCount: input.sessionMetrics.filesModified,
    mutationToolRatio: ratio,
    largeDiffDetected: input.sessionMetrics.largeDiffDetected,
    failedVerificationCount: input.sessionMetrics.failedVerificationCount,
  })
}
