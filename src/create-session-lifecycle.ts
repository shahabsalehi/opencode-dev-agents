import { formatPendingApprovals, approvalStore } from "./approval-gates.js"
import { formatRunSummary } from "./audit/summary.js"
import type { RunLedger } from "./audit/run-ledger.js"
import type { AuthHook } from "@opencode-ai/plugin"
import { DEFAULTS, getConfig } from "./config.js"
import { applyMviContext, discoverContextFiles } from "./context/context-scout.js"
import { compressContextBlocks } from "./context/compression.js"
import { rankContextBlocks, budgetContextBlocks } from "./context/ranker.js"
import { recoverContextBlocks } from "./context/recovery.js"
import { validateCompactionOutput } from "./context/compaction-validator.js"
import type { CompactionRescueCache } from "./context/compaction-rescue.js"
import { formatDelegationList, listDelegations } from "./delegation/store.js"
import { formatThoughtList, listThoughts } from "./thoughts/store.js"
import { buildContinuationHandoff } from "./continuation/handoff.js"
import type { AdaptiveStrictnessLevel } from "./policy/types.js"

type DelegationRuntimeLike = {
  handleSessionIdle(sessionID: string): Promise<void>
  handleSessionError(sessionID: string, error: string): Promise<void>
}

export function createSessionLifecycleHooks(input: {
  directory: string
  runLedger: RunLedger
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
    enableExperimentalCompaction: boolean
    enableSystemTransform: boolean
    enableAuthHook: boolean
    enableCompactionRescue: boolean
  }
  delegationRuntime: DelegationRuntimeLike | null
  compactionRescueCache: CompactionRescueCache | null
}) {
  const hooks: Record<string, unknown> = {
    event: async (eventInput: { event?: { type?: string; properties?: Record<string, unknown> } }) => {
      if (!input.delegationRuntime) return
      const event = eventInput.event
      const type = event?.type
      const properties = event?.properties ?? {}
      const sessionID = typeof properties.sessionID === "string" ? properties.sessionID : undefined
      if (!sessionID) return

      if (type === "session.idle") {
        await input.delegationRuntime.handleSessionIdle(sessionID)
        return
      }

      if (type === "session.error") {
        const error = typeof properties.error === "string" ? properties.error : "unknown-session-error"
        await input.delegationRuntime.handleSessionError(sessionID, error)
      }
    },

    "tool.definition": async (
      toolInput: { toolID?: string },
      toolOutput: { description: string }
    ) => {
      toolOutput.description = `SWE Sworm: ${toolOutput.description}`

      const toolName = toolInput.toolID
      if (!toolName) return

      const shared = [
        "Output format: ## Summary, then ## Details.",
        "Uses bounded caches and concurrency caps.",
        "Set diffOnly=true to skip cached (unchanged) files."
      ]

      const toolNotes: Record<string, string[]> = {
        codeAnalyzer: [
          "Best for: fast quality/complexity overview across a file or folder.",
          "Limits: maxFiles (default 50), file types: js/ts/jsx/tsx/py/go/java/rb/php.",
          "Example: { target: " + '"src"' + ", threshold: 70, maxFiles: 50 }"
        ],
        bugDetector: [
          "Best for: quick scan of bug/security patterns across a scope.",
          "Limits: maxResults (default 100), maxFiles 200.",
          "Example: { scope: " + '"src"' + ", patterns: [" + '"security"' + ", " + '"logic"' + "] }"
        ],
        dependencyGraph: [
          "Best for: mapping imports/exports and circular dependencies.",
          "Limits: maxFiles 500, depth (default 5).",
          "Example: { entryPoints: [" + '"src/index.ts"' + "], depth: 4, direction: " + '"both"' + " }"
        ],
        testGenerator: [
          "Best for: generating scaffolding tests from function signatures.",
          "Writes files to disk; review before committing.",
          "Example: { sourceFiles: [" + '"src/foo.ts"' + "], framework: " + '"vitest"' + " }"
        ],
        refactorEngine: [
          "Best for: safe, preview-first refactors.",
          "Default is dryRun=true; set dryRun=false to write changes.",
          "Example: { files: [" + '"src/foo.ts"' + "], transformation: " + '"modernize-syntax"' + " }"
        ]
      }

      const notes = toolNotes[toolName]
      if (!notes) return

      toolOutput.description = `${toolOutput.description}\n\n${[...shared, ...notes].map((line) => `- ${line}`).join("\n")}`
    },
  }

  if (input.featureFlags.enableExperimentalCompaction) {
    hooks["experimental.session.compacting"] = async (
      compactInput: { sessionID: string },
      compactOutput: { context: string[] }
    ) => {
      if (input.compactionRescueCache && compactOutput.context.length > 0) {
        const initialValidation = validateCompactionOutput(compactOutput.context)
        if (initialValidation.valid) {
          input.compactionRescueCache.captureSnapshot(compactInput.sessionID, compactOutput.context)
        }
      }

      const toolUsage = Array.from(input.sessionMetrics.toolUsage.entries())
        .map(([tool, count]) => `${tool}: ${count}`)
        .join(", ")

      const sessionID = compactInput.sessionID
      const pendingApprovals = approvalStore.getPendingApprovals(sessionID)
      const runSummary = formatRunSummary(input.runLedger.get(sessionID))

      let approvalContext = ""
      if (pendingApprovals.length > 0) {
        approvalContext = `\n- Pending approvals: ${pendingApprovals.length}\n` +
          formatPendingApprovals(pendingApprovals).split("\n").slice(1).map((line) => `  ${line}`).join("\n")
      }

      const delegations = await listDelegations(input.directory)
      const pendingCount = delegations.filter((item) => item.status === "pending").length
      const thoughts = await listThoughts(input.directory)
      const delegationSummary = delegations.length > 0
        ? `\n- Delegations: ${delegations.length} (pending: ${pendingCount})\n  ${formatDelegationList(delegations).split("\n").slice(0, 5).join("\n  ")}`
        : ""
      const thoughtSummary = thoughts.length > 0
        ? `\n- Thoughts: ${thoughts.length}\n  ${formatThoughtList(thoughts).split("\n").slice(0, 5).join("\n  ")}`
        : ""

      const latestPlan = thoughts
        .filter((item) => item.title.toLowerCase().startsWith("plan:"))
        .sort((a, b) => b.createdAt - a.createdAt)[0]
      const handoff = buildContinuationHandoff({
        runState: input.runLedger.get(sessionID),
        pendingApprovals: pendingApprovals.length,
        pendingDelegations: pendingCount,
        latestPlanTitle: latestPlan?.title,
        latestPlanAgeMinutes: latestPlan ? Math.round((Date.now() - latestPlan.createdAt) / 60000) : undefined,
      })

      const hasMetrics = compactOutput.context.some((value) => value.includes("## SWE Sworm Plugin Metrics"))
      if (!hasMetrics) {
        compactOutput.context.push(
          `## SWE Sworm Plugin Metrics\n` +
            `- Tool calls: ${input.sessionMetrics.toolCalls}\n` +
            `- Files modified: ${input.sessionMetrics.filesModified}\n` +
            `- Tool usage: ${toolUsage || "none"}\n` +
            `- Second-opinion requests: ${input.sessionMetrics.secondOpinionRequests}\n` +
            `- Second-opinion cache hits: ${input.sessionMetrics.secondOpinionCacheHits}\n` +
            `- Second-opinion escalations: ${input.sessionMetrics.secondOpinionEscalations}\n` +
            `- Run summary: ${runSummary}` +
            approvalContext +
            delegationSummary +
            thoughtSummary +
            `\n\n${handoff}`
        )
      }

      if (input.featureFlags.enableCompactionRescue && input.compactionRescueCache) {
        const validation = validateCompactionOutput(compactOutput.context)
        if (!validation.valid) {
          const rescued = input.compactionRescueCache.rescue(compactInput.sessionID, compactOutput.context)
          if (rescued) {
            compactOutput.context.length = 0
            compactOutput.context.push(...rescued)
          }
        }
      }
    }
  }

  if (input.featureFlags.enableSystemTransform) {
    hooks["experimental.chat.system.transform"] = async (_systemInput: unknown, systemOutput: { system: string[] }) => {
      const config = getConfig()
      const linesPerFile = config.context?.linesPerFile ?? DEFAULTS.context.linesPerFile
      const totalLines = config.context?.totalLines ?? DEFAULTS.context.totalLines
      const contextFiles = await discoverContextFiles(input.directory)
      const contextBlocks = applyMviContext(contextFiles, linesPerFile)
      const ranked = rankContextBlocks(contextBlocks)
      const budgeted = budgetContextBlocks(ranked, 8)
      const compressed = compressContextBlocks(budgeted, totalLines)
      const charMultiplier = 140
      const recovered = recoverContextBlocks(compressed.blocks, totalLines * charMultiplier)
      systemOutput.system.push(...recovered.blocks)
    }
  }

  if (input.featureFlags.enableAuthHook) {
    const authHook: AuthHook = {
      provider: "swe-sworm-governance",
      loader: async () => ({}),
      methods: [
        {
          type: "api",
          label: "Governance API Key",
          prompts: [
            {
              type: "text",
              key: "apiKey",
              message: "Enter governance provider API key",
              placeholder: "sk-...",
              validate: (value: string) =>
                value.trim().length > 0 ? undefined : "API key is required",
            },
          ],
          authorize: async (inputs?: Record<string, string>) => {
            const apiKey = inputs?.apiKey
            if (!apiKey || apiKey.trim().length === 0) {
              return { type: "failed" }
            }
            return {
              type: "success",
              key: apiKey,
              provider: "swe-sworm-governance",
            }
          },
        },
      ],
    }
    hooks.auth = authHook
  }

  return hooks
}
