import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { approvalStore, formatPendingApprovals } from "./approval-gates.js"
import { appendAuditEntry } from "./audit/logger.js"
import { buildGovernanceReport } from "./audit/report.js"
import type { RunLedger } from "./audit/run-ledger.js"
import { DEFAULTS, getConfig } from "./config.js"
import { routeTask } from "./orchestrator/router.js"
import { buildDelegationRecord } from "./delegation/runtime.js"
import { formatDelegationList, listDelegations, readDelegation, saveDelegation, updateDelegation } from "./delegation/store.js"
import { formatThoughtList, listThoughts, saveThought } from "./thoughts/store.js"
import { externalCache } from "./utils/cache.js"
import { executeSkill } from "./skills/executor.js"
import type { SkillsRegistry } from "./skills/registry.js"
import type { StrictControlPolicy } from "./policy/types.js"
import { generateScorecard } from "./benchmark/scorecard-generator.js"
import { GOVERNANCE_EVAL_SCENARIOS } from "./benchmark/eval-scenarios.js"
import { runEvalScenarios } from "./benchmark/eval-harness.js"
import { buildMutationClusters } from "./mutation/clustering.js"
import { normalizeToolOutput } from "./normalization/tool-output.js"
import { buildContinuationHandoff } from "./continuation/handoff.js"
import type { AutopilotController } from "./autopilot/controller.js"

type DelegationRuntimeLike = {
  start(args: {
    delegationID: string
    prompt: string
    agent: string
    parentSessionID: string
    parentAgent?: string
  }): Promise<{ delegationID: string }>
  getActiveCountForParent(parentSessionID: string): number
}

export function createGovernanceTools(input: {
  runLedger: RunLedger
  skillsRegistry: SkillsRegistry
  strictPolicy: StrictControlPolicy
  sessionMetrics: {
    toolCalls: number
    filesModified: number
    largeDiffDetected: boolean
    failedVerificationCount: number
    adaptiveStrictness: string
  }
  availableAgents: Set<string>
  delegationRuntime: DelegationRuntimeLike | null
  approvalTtlMs: number
  approvalDefaultReason: string
  autopilotController?: AutopilotController | null
}): Record<string, ToolDefinition> {
  const autopilotController = input.autopilotController ?? null
  return {
    approval: tool({
      description: "Manage approval-gated actions (list/approve/deny).",
      args: {
        action: tool.schema.enum(["list", "approve", "deny", "approveAll"]).describe("Approval action to perform"),
        callID: tool.schema.string().optional().describe("Specific callID to approve/deny"),
        reason: tool.schema.string().optional().describe("Human reason for approval/denial"),
        ttlMs: tool.schema.number().min(1000).max(24 * 60 * 60 * 1000).optional().describe("Approval TTL in milliseconds")
      },
      async execute(args, context) {
        const { action, callID } = args
        const sessionID = context.sessionID

        if (action === "list") {
          const pending = approvalStore.getPendingApprovals(sessionID)
          return formatPendingApprovals(pending)
        }

        if (action === "approveAll") {
          const approvedCount = approvalStore.approveAllForSession(sessionID)
          autopilotController?.resume(sessionID)
          await appendAuditEntry(context.directory, {
            timestamp: new Date().toISOString(),
            sessionID,
            action: "approval.approveAll",
            status: "allow",
            details: { approvedCount }
          })
          return `✅ Approved ${approvedCount} pending action(s) for this session.`
        }

        if (!callID) {
          return "❌ callID is required for approve/deny actions."
        }

        if (action === "approve") {
          const success = approvalStore.approve(
            sessionID,
            callID,
            args.reason ?? input.approvalDefaultReason,
            args.ttlMs ?? input.approvalTtlMs
          )
          await appendAuditEntry(context.directory, {
            timestamp: new Date().toISOString(),
            sessionID,
            callID,
            action: "approval.approve",
            status: success ? "allow" : "deny",
            details: {
              reason: args.reason ?? input.approvalDefaultReason,
              ttlMs: args.ttlMs ?? input.approvalTtlMs,
            }
          })
          if (success) {
            autopilotController?.resume(sessionID)
            return `✅ Approved ${callID}.`
          }
          return `❌ No pending approval found for ${callID}.`
        }

        if (action === "deny") {
          const success = approvalStore.deny(sessionID, callID)
          await appendAuditEntry(context.directory, {
            timestamp: new Date().toISOString(),
            sessionID,
            callID,
            action: "approval.deny",
            status: success ? "deny" : "error",
            details: {
              reason: args.reason ?? "manual-deny",
            }
          })
          return success
            ? `❌ Denied ${callID}.`
            : `❌ No pending approval found for ${callID}.`
        }

        return "❌ Unknown action."
      }
    }),
    delegate: tool({
      description: "Create a delegation record to persist a background task prompt.",
      args: {
        prompt: tool.schema.string().describe("Task prompt to delegate"),
        agent: tool.schema.string().default("auto").describe("Agent name or 'auto' for dynamic routing")
      },
      async execute(args, context) {
        const id = `del_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
        const requestedAgent = args.agent
        const selectedAgent =
          requestedAgent !== "auto" && input.availableAgents.size > 0 && !input.availableAgents.has(requestedAgent)
            ? "auto"
            : requestedAgent
        const routing = routeTask(args.prompt, selectedAgent)
        const record = buildDelegationRecord({
          id,
          prompt: args.prompt,
          agent: routing.agent,
        })
        await saveDelegation(context.directory, record)

        if (input.delegationRuntime) {
          try {
            const started = await input.delegationRuntime.start({
              delegationID: id,
              prompt: args.prompt,
              agent: routing.agent,
              parentSessionID: context.sessionID,
              parentAgent: context.agent,
            })
            const fallbackNote =
              selectedAgent === "auto" && requestedAgent !== "auto"
                ? ` (requested '${requestedAgent}' unavailable; fell back to auto)`
                : ""
            return `✅ Delegation started: ${started.delegationID} | agent: ${routing.agent} | category: ${routing.category}${fallbackNote}`
          } catch (error) {
            await updateDelegation(context.directory, id, {
              status: "error",
              result: `Runtime start failed: ${String(error)}`,
              completedAt: Date.now(),
            })
            return `❌ Delegation failed to start: ${id}`
          }
        }

        return `✅ Delegation recorded (runtime disabled): ${id}`
      }
    }),
    route_task: tool({
      description: "Preview dynamic routing decision for a task prompt.",
      args: {
        prompt: tool.schema.string().describe("Task prompt"),
        agent: tool.schema.string().optional().describe("Optional explicit agent"),
      },
      async execute(args) {
        return JSON.stringify(routeTask(args.prompt, args.agent), null, 2)
      }
    }),
    delegation_update: tool({
      description: "Update a delegation record (status/result).",
      args: {
        id: tool.schema.string().describe("Delegation id"),
        status: tool.schema.enum(["pending", "running", "completed", "error", "cancelled", "timeout"]).optional().describe("New status"),
        result: tool.schema.string().optional().describe("Result summary")
      },
      async execute(args, context) {
        const updated = await updateDelegation(context.directory, args.id, {
          status: args.status,
          result: args.result
        })
        if (!updated) return `❌ Delegation not found: ${args.id}`
        return `✅ Delegation updated: ${args.id}`
      }
    }),
    delegation_read: tool({
      description: "Read a delegation record by id.",
      args: {
        id: tool.schema.string().describe("Delegation id")
      },
      async execute(args, context) {
        const record = await readDelegation(context.directory, args.id)
        if (!record) return `❌ Delegation not found: ${args.id}`
        return JSON.stringify(record, null, 2)
      }
    }),
    delegation_list: tool({
      description: "List delegation records for this project.",
      args: {},
      async execute(_args, context) {
        const records = await listDelegations(context.directory)
        return formatDelegationList(records)
      }
    }),
    delegation_status: tool({
      description: "Show runtime delegation status for the current session.",
      args: {},
      async execute(_args, context) {
        const records = await listDelegations(context.directory)
        const pendingRecords = records.filter((item) => item.status === "pending" || item.status === "running")
        const activeForSession = input.delegationRuntime?.getActiveCountForParent(context.sessionID) ?? 0
        const payload = {
          activeRuntimeDelegations: activeForSession,
          pendingOrRunningRecords: pendingRecords.length,
          delegations: pendingRecords.slice(0, 20).map((item) => ({
            id: item.id,
            agent: item.agent,
            status: item.status,
            sessionID: item.sessionID,
          })),
          guidance:
            activeForSession > 0
              ? "Delegations are still running. Wait for task-notification messages instead of polling."
              : "No active runtime delegations for this session.",
        }
        return JSON.stringify(payload, null, 2)
      }
    }),
    thought_log: tool({
      description: "Persist a decision, note, or summary for later recall.",
      args: {
        title: tool.schema.string().describe("Short title for the thought"),
        content: tool.schema.string().describe("Full content")
      },
      async execute(args, context) {
        const id = `thought_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
        await saveThought(context.directory, {
          id,
          title: args.title,
          content: args.content,
          createdAt: Date.now()
        })
        return `✅ Saved thought: ${id}`
      }
    }),
    thought_list: tool({
      description: "List saved thoughts for this project.",
      args: {},
      async execute(_args, context) {
        const records = await listThoughts(context.directory)
        return formatThoughtList(records)
      }
    }),
    skill_list: tool({
      description: "List registered governed skills.",
      args: {},
      async execute() {
        const enabled = getConfig().skills?.enabled ?? DEFAULTS.skills.enabled
        if (!enabled) {
          return "Skills are disabled. Set skills.enabled=true in config to use governed skills."
        }
        return JSON.stringify(input.skillsRegistry.list(), null, 2)
      },
    }),
    skill_execute: tool({
      description: "Execute a governed skill template if policy allows.",
      args: {
        name: tool.schema.string().describe("Skill name"),
      },
      async execute(args, context) {
        const enabled = getConfig().skills?.enabled ?? DEFAULTS.skills.enabled
        if (!enabled) {
          return "❌ Skills are disabled by configuration."
        }
        const skill = input.skillsRegistry.get(args.name)
        if (!skill) {
          return `❌ Unknown skill: ${args.name}`
        }
        const allowlist = getConfig().skills?.allowlist ?? DEFAULTS.skills.allowlist
        const result = executeSkill({
          skill,
          sessionID: context.sessionID,
          runLedger: input.runLedger,
          policy: input.strictPolicy,
          allowlist,
        })

        await appendAuditEntry(context.directory, {
          timestamp: new Date().toISOString(),
          sessionID: context.sessionID,
          action: "skill.execute",
          status: result.ok ? "allow" : "deny",
          tool: `skill:${skill.name}`,
          details: {
            blockedReason: result.blockedReason,
          },
        })

        return result.output
      },
    }),
    governance_report: tool({
      description: "Generate governance report for the active session.",
      args: {},
      async execute(_args, context) {
        const runState = input.runLedger.get(context.sessionID)
        const pendingApprovals = approvalStore.getPendingApprovals(context.sessionID)
        const delegations = await listDelegations(context.directory)
        const thoughts = await listThoughts(context.directory)
        const report = buildGovernanceReport({
          sessionID: context.sessionID,
          runState,
          pendingApprovals: pendingApprovals.length,
          delegationStatuses: delegations.map((item) => ({ status: item.status })),
          thoughtCount: thoughts.length,
        })
        return JSON.stringify(report, null, 2)
      }
    }),
    session_hud: tool({
      description: "Show compact session governance and execution status.",
      args: {},
      async execute(_args, context) {
        const runState = input.runLedger.get(context.sessionID)
        const pendingApprovals = approvalStore.getPendingApprovals(context.sessionID)
        const delegations = await listDelegations(context.directory)
        const runningDelegations = delegations.filter((item) => item.status === "running").length
        const pendingDelegations = delegations.filter((item) => item.status === "pending").length
        const latestPlan = (await listThoughts(context.directory))
          .filter((item) => item.title.toLowerCase().startsWith("plan:"))
          .sort((a, b) => b.createdAt - a.createdAt)[0]
        const planAgeMinutes = latestPlan
          ? Math.round((Date.now() - latestPlan.createdAt) / 60000)
          : null

        return [
          "Session HUD",
          `Tools: ${runState.toolCalls} | Files modified: ${runState.filesModified}`,
          `Policy: allow ${runState.policy.allow} | deny ${runState.policy.deny} | ask ${runState.policy.needsApproval}`,
          `Approvals pending: ${pendingApprovals.length}`,
          `Delegations: running ${runningDelegations} | pending ${pendingDelegations}`,
          latestPlan
            ? `Plan: ${latestPlan.title} (${planAgeMinutes}m old)`
            : "Plan: none",
          `Adaptive: ${input.sessionMetrics.adaptiveStrictness} | Large diff: ${input.sessionMetrics.largeDiffDetected}`,
          `Verification failures: ${input.sessionMetrics.failedVerificationCount}`,
        ].join("\n")
      },
    }),
    governance_scorecard: tool({
      description: "Generate a governance scorecard snapshot for this session/project.",
      args: {
        projectID: tool.schema.string().optional().describe("Optional project identifier override"),
      },
      async execute(args, context) {
        const runState = input.runLedger.get(context.sessionID)
        const scorecard = generateScorecard({
          projectID: args.projectID ?? context.directory,
          strictPolicy: input.strictPolicy,
          runState,
        })
        return JSON.stringify(scorecard, null, 2)
      },
    }),
    autopilot_status: tool({
      description: "Show autopilot controller status for the current session.",
      args: {},
      async execute(_args, context) {
        if (!autopilotController) {
          return "Autopilot is not active for this session mode."
        }
        return JSON.stringify(autopilotController.getStatus(context.sessionID), null, 2)
      },
    }),
    governance_eval: tool({
      description: "Run governance evaluation scenarios against current policy.",
      args: {},
      async execute() {
        const summary = runEvalScenarios(GOVERNANCE_EVAL_SCENARIOS, input.strictPolicy)
        return JSON.stringify(summary, null, 2)
      },
    }),
    continuation_handoff: tool({
      description: "Generate a concise continuation handoff for ongoing or interrupted sessions.",
      args: {},
      async execute(_args, context) {
        const runState = input.runLedger.get(context.sessionID)
        const pendingApprovals = approvalStore.getPendingApprovals(context.sessionID)
        const delegations = await listDelegations(context.directory)
        const thoughts = await listThoughts(context.directory)
        const latestPlan = thoughts
          .filter((item) => item.title.toLowerCase().startsWith("plan:"))
          .sort((a, b) => b.createdAt - a.createdAt)[0]

        const handoff = buildContinuationHandoff({
          runState,
          pendingApprovals: pendingApprovals.length,
          pendingDelegations: delegations.filter((item) => item.status === "pending" || item.status === "running").length,
          latestPlanTitle: latestPlan?.title,
          latestPlanAgeMinutes: latestPlan ? Math.round((Date.now() - latestPlan.createdAt) / 60000) : undefined,
        })

        return handoff
      },
    }),
    tool_result_normalize: tool({
      description: "Normalize tool output into a consistent status/summary envelope.",
      args: {
        tool: tool.schema.string().describe("Tool name that produced the output"),
        output: tool.schema.string().describe("Raw output text"),
      },
      async execute(args) {
        return JSON.stringify(
          normalizeToolOutput(args.tool, args.output, {}),
          null,
          2
        )
      },
    }),
    mutation_cluster_plan: tool({
      description: "Cluster candidate mutation files into safer focused edit groups.",
      args: {
        files: tool.schema.array(tool.schema.string()).describe("List of target files"),
      },
      async execute(args) {
        const clusters = buildMutationClusters(args.files)
        return JSON.stringify({ clusters }, null, 2)
      },
    }),
    mcp_bundle_list: tool({
      description: "List bundled high-value MCP profiles for common development workflows.",
      args: {},
      async execute() {
        const bundles = [
          {
            id: "github-core",
            purpose: "Issues, pull requests, checks, and repository metadata",
            servers: ["github"],
          },
          {
            id: "web-research",
            purpose: "Documentation and web retrieval for implementation guidance",
            servers: ["context7", "websearch"],
          },
          {
            id: "browser-verification",
            purpose: "Browser automation and UI verification",
            servers: ["playwright"],
          },
          {
            id: "full-engineering",
            purpose: "Integrated coding workflow with repository + research + browser checks",
            servers: ["github", "context7", "websearch", "playwright"],
          },
        ]
        return JSON.stringify({ bundles }, null, 2)
      },
    }),
    mcp_bundle_generate: tool({
      description: "Generate a configuration snippet for a bundled MCP profile.",
      args: {
        bundle: tool.schema.enum(["github-core", "web-research", "browser-verification", "full-engineering"]).describe("Bundle id"),
      },
      async execute(args) {
        const bundleServers: Record<string, string[]> = {
          "github-core": ["github"],
          "web-research": ["context7", "websearch"],
          "browser-verification": ["playwright"],
          "full-engineering": ["github", "context7", "websearch", "playwright"],
        }
        const servers = bundleServers[args.bundle]
        return JSON.stringify({
          mcp: {
            enabled: true,
            profiles: {
              [args.bundle]: {
                servers,
              },
            },
          },
        }, null, 2)
      },
    }),
    pattern_onboard: tool({
      description: "Generate a plan-first pattern onboarding pack for team/project standards.",
      args: {
        projectName: tool.schema.string().describe("Project name"),
        stack: tool.schema.array(tool.schema.string()).default([]).describe("Primary tech stack items"),
        enforceApproval: tool.schema.boolean().default(true).describe("Whether to enforce approval-first workflow"),
      },
      async execute(args, context) {
        const pack = buildPatternOnboardingPack({
          projectName: args.projectName,
          stack: args.stack,
          enforceApproval: args.enforceApproval,
        })

        await appendAuditEntry(context.directory, {
          timestamp: new Date().toISOString(),
          sessionID: context.sessionID,
          action: "pattern.onboard",
          status: "allow",
          details: {
            projectName: args.projectName,
            stack: args.stack,
            enforceApproval: args.enforceApproval,
          },
        })

        return JSON.stringify(pack, null, 2)
      },
    }),
    context_pack_generate: tool({
      description: "Generate reusable team context pack templates for .opencode/context.",
      args: {
        teamName: tool.schema.string().describe("Team name"),
        projectName: tool.schema.string().describe("Project name"),
      },
      async execute(args, context) {
        const pack = buildTeamContextPack({
          teamName: args.teamName,
          projectName: args.projectName,
        })

        await appendAuditEntry(context.directory, {
          timestamp: new Date().toISOString(),
          sessionID: context.sessionID,
          action: "context.pack.generate",
          status: "allow",
          details: {
            teamName: args.teamName,
            projectName: args.projectName,
          },
        })

        return JSON.stringify(pack, null, 2)
      },
    }),
    external_scout: tool({
      description: "Summarize provided external documentation snippets with minimal token usage.",
      args: {
        query: tool.schema.string().describe("Search query"),
        snippets: tool.schema.array(tool.schema.string()).optional().describe("External snippets to summarize"),
        maxChars: tool.schema.number().min(1000).max(8000).default(4000).describe("Max characters to return")
      },
      async execute(args) {
        const cacheKey = `${args.query}:${args.maxChars}:${args.snippets?.length || 0}`
        const cached = externalCache.get(cacheKey)?.value
        if (cached) return cached

        if (!args.snippets || args.snippets.length === 0) {
          const response = JSON.stringify({
            query: args.query,
            result: "No snippets provided. Use websearch to fetch sources and pass snippets here."
          }, null, 2)
          externalCache.set(cacheKey, { value: response })
          return response
        }

        const summary = args.snippets
          .map((snippet, index) => `Source ${index + 1}: ${snippet.trim()}`)
          .join("\n\n")
          .slice(0, args.maxChars)

        const response = JSON.stringify({
          query: args.query,
          summary
        }, null, 2)

        externalCache.set(cacheKey, { value: response })
        return response
      }
    }),
  }
}

function buildPatternOnboardingPack(input: {
  projectName: string
  stack: string[]
  enforceApproval: boolean
}): {
  project: string
  workflow: string[]
  checklist: string[]
  templates: {
    apiPattern: string
    componentPattern: string
    dataPattern: string
    securityPattern: string
  }
} {
  const stack = input.stack.length > 0 ? input.stack.join(", ") : "unspecified"
  return {
    project: input.projectName,
    workflow: [
      "discover-patterns",
      "propose-plan",
      input.enforceApproval ? "approval-gate" : "record-only-review",
      "incremental-execution",
      "verification-and-report",
    ],
    checklist: [
      `Document stack and architecture (${stack})`,
      "Capture naming conventions and error-handling style",
      "Capture API request/response shape and validation requirements",
      "Capture testing strategy and evidence expectations",
      "Capture security and redline constraints",
    ],
    templates: {
      apiPattern: "Input validation -> domain call -> typed response -> error envelope",
      componentPattern: "Props contract -> deterministic rendering -> accessibility checks",
      dataPattern: "Schema-first models -> explicit migrations -> rollback plan",
      securityPattern: "No secrets in logs -> explicit allowlists -> audit trail entries",
    },
  }
}

function buildTeamContextPack(input: {
  teamName: string
  projectName: string
}): {
  root: string
  files: Array<{ path: string; purpose: string; template: string }>
} {
  const root = `.opencode/context/${input.projectName}`
  return {
    root,
    files: [
      {
        path: `${root}/standards.md`,
        purpose: "Team-wide coding standards and review expectations",
        template: `# ${input.teamName} Standards\n- Naming:\n- Error handling:\n- Testing evidence:\n- Security constraints:\n`,
      },
      {
        path: `${root}/api-patterns.md`,
        purpose: "Canonical API handler/request-response patterns",
        template: "# API Patterns\n- Validation layer\n- Domain/service flow\n- Response envelope\n- Failure modes\n",
      },
      {
        path: `${root}/architecture.md`,
        purpose: "Module boundaries and dependency constraints",
        template: "# Architecture\n- Layer boundaries\n- Allowed dependencies\n- Stateful components\n- Migration strategy\n",
      },
    ],
  }
}
