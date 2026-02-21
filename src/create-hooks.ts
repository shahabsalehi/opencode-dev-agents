import type { ProviderContext, Hooks } from "@opencode-ai/plugin"
import type { Config, Permission, UserMessage, Part, Model, Message } from "@opencode-ai/sdk"
import { appendAuditEntry } from "./audit/logger.js"
import { enforcePolicyBefore, shouldRequireApproval } from "./policy/enforce.js"
import type { RunLedger } from "./audit/run-ledger.js"
import type { StrictControlPolicy } from "./policy/types.js"
import type { GovernanceMetadata } from "./create-policy.js"

type ApprovalStoreLike = {
  getPendingApprovals(sessionID: string): Array<unknown>
}

export function createGovernanceHooks(input: {
  strictPolicy: StrictControlPolicy
  runLedger: RunLedger
  directory: string
  governanceMetadata: GovernanceMetadata
  approvalStore: ApprovalStoreLike
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
  enableChatMessagesTransform: boolean
  enableTextCompleteHook: boolean
}): Pick<Hooks, "config" | "permission.ask" | "chat.message" | "chat.params" | "chat.headers" | "command.execute.before" | "shell.env" | "experimental.chat.messages.transform" | "experimental.text.complete"> {
  return {
    config: async (config: Config) => {
      config.command = config.command ?? {}
      if (!config.command["approval-list"]) {
        config.command["approval-list"] = {
          template: "Run the approval tool with action=list and report pending items.",
          description: "List pending swe-sworm approvals",
          agent: "build",
          subtask: false,
        }
      }

      config.agent = config.agent ?? {}
      if (!config.agent["swe-sworm-guard"]) {
        config.agent["swe-sworm-guard"] = {
          mode: "subagent",
          description: "Governance-focused reviewer for risk and approval-sensitive tasks.",
          temperature: 0.1,
        }
      }
    },

    "permission.ask": async (
      permission: Permission,
      output: { status: "ask" | "deny" | "allow" }
    ) => {
      try {
        const toolName = extractPermissionToolName(permission)
        const args = extractPermissionArgs(permission)

        const evaluation = enforcePolicyBefore(
          { toolName, args },
          input.strictPolicy,
          input.runLedger,
          permission.sessionID
        )

        if (input.strictPolicy.enabled && !input.strictPolicy.recordOnly) {
          if (evaluation.blocked) {
            output.status = "deny"
          } else if (shouldRequireApproval(evaluation.evaluation)) {
            output.status = "ask"
          }
        }

        await appendAuditEntry(input.directory, {
          timestamp: new Date().toISOString(),
          sessionID: permission.sessionID,
          callID: permission.callID,
          action: "permission.ask",
          status: output.status === "deny" ? "deny" : output.status === "allow" ? "allow" : "ask",
          tool: toolName,
          details: {
            permissionType: permission.type,
            permissionTitle: permission.title,
            permissionID: permission.id,
            risk: evaluation.evaluation.risk,
            reason: evaluation.evaluation.reason,
            governance: input.governanceMetadata,
          },
        })
      } catch (error) {
        try {
          await input.client.app.log({
            body: {
              service: "swe-sworm-plugin",
              level: "error",
              message: "Permission hook error",
              extra: { error: String(error) },
            },
          })
        } catch {
          return
        }
      }
    },

    "chat.message": async (
      chatInput: {
        sessionID: string
        agent?: string
        model?: {
          providerID: string
          modelID: string
        }
        messageID?: string
        variant?: string
      },
      chatOutput: { message: UserMessage; parts: Part[] }
    ) => {
      const pending = input.approvalStore.getPendingApprovals(chatInput.sessionID)
      if (pending.length === 0) {
        return
      }

      const notice = {
        type: "text",
        text: `Governance notice: ${pending.length} approval(s) pending in this session. Use the approval tool before high-risk operations.`,
      } as Part
      chatOutput.parts.push(notice)
    },

    "chat.params": async (
      _chatParamsInput: {
        sessionID: string
        agent: string
        model: Model
        provider: ProviderContext
        message: UserMessage
      },
      chatParamsOutput: {
        temperature: number
        topP: number
        topK: number
        options: Record<string, unknown>
      }
    ) => {
      if (!input.strictPolicy.enabled) {
        return
      }

      if (chatParamsOutput.temperature > 0.2) {
        chatParamsOutput.temperature = 0.2
      }
    },

    "chat.headers": async (
      _input: {
        sessionID: string
        agent: string
        model: Model
        provider: ProviderContext
        message: UserMessage
      },
      output: { headers: Record<string, string> }
    ) => {
      try {
        output.headers["X-Governance-Project"] = input.governanceMetadata.projectID
        output.headers["X-Governance-Strict"] = String(input.strictPolicy.enabled)

        await appendAuditEntry(input.directory, {
          timestamp: new Date().toISOString(),
          sessionID: _input.sessionID,
          action: "chat.headers",
          status: "allow",
          details: {
            agent: _input.agent,
            headersInjected: ["X-Governance-Project", "X-Governance-Strict"],
            governance: input.governanceMetadata,
          },
        })
      } catch (error) {
        try {
          await input.client.app.log({
            body: {
              service: "swe-sworm-plugin",
              level: "error",
              message: "Chat headers hook error",
              extra: { error: String(error) },
            },
          })
        } catch {
          return
        }
      }
    },

    "command.execute.before": async (
      commandInput: {
        command: string
        sessionID: string
        arguments: string
      },
      commandOutput: { parts: Part[] }
    ) => {
      try {
        const pending = input.approvalStore.getPendingApprovals(commandInput.sessionID)
        if (pending.length > 0) {
          commandOutput.parts.push({
            type: "text",
            text: `⚠️ Governance: ${pending.length} approval(s) pending. Resolve before executing commands.`,
          } as Part)
        }

        if (input.strictPolicy.enabled && !input.strictPolicy.recordOnly) {
          const policyResult = enforcePolicyBefore(
            { toolName: `command:${commandInput.command}`, args: { arguments: commandInput.arguments } },
            input.strictPolicy,
            input.runLedger,
            commandInput.sessionID
          )
          if (policyResult.blocked) {
            commandOutput.parts.push({
              type: "text",
              text: `⛔ Command blocked by policy: ${policyResult.evaluation.reason}`,
            } as Part)
          }
        }

        await appendAuditEntry(input.directory, {
          timestamp: new Date().toISOString(),
          sessionID: commandInput.sessionID,
          action: "command.execute.before",
          status: "allow",
          details: {
            command: commandInput.command,
            arguments: commandInput.arguments,
            pendingApprovals: pending.length,
            governance: input.governanceMetadata,
          },
        })
      } catch (error) {
        await input.client.app.log({
          body: {
            service: "swe-sworm-plugin",
            level: "error",
            message: "Command execute before hook error",
            extra: { error: String(error) },
          },
        })
      }
    },

    "shell.env": async (
      shellInput: { cwd: string },
      shellOutput: { env: Record<string, string> }
    ) => {
      try {
        shellOutput.env["SWE_SWORM_STRICT"] = String(input.strictPolicy.enabled)
        shellOutput.env["SWE_SWORM_RECORD_ONLY"] = String(input.strictPolicy.recordOnly)
        shellOutput.env["SWE_SWORM_PROJECT_ID"] = input.governanceMetadata.projectID

        await input.client.app.log({
          body: {
            service: "swe-sworm-plugin",
            level: "debug",
            message: "Shell env injected",
            extra: { cwd: shellInput.cwd },
          },
        })
      } catch (error) {
        await input.client.app.log({
          body: {
            service: "swe-sworm-plugin",
            level: "error",
            message: "Shell env hook error",
            extra: { error: String(error) },
          },
        }).catch(() => {})
      }
    },

    "experimental.chat.messages.transform": async (
      _input: Record<string, never>,
      output: {
        messages: {
          info: Message
          parts: Part[]
        }[]
      }
    ) => {
      try {
        if (!input.enableChatMessagesTransform || !input.strictPolicy.enabled) {
          return
        }

        for (const message of output.messages) {
          if (message.info.role === "assistant") {
            const hasToolParts = message.parts.some(
              (part) => "type" in part && (part as Record<string, unknown>).type === "tool"
            )
            if (hasToolParts) {
              message.parts.push({
                type: "text",
                text: `[governance: strict-mode=${input.strictPolicy.enabled}, record-only=${input.strictPolicy.recordOnly}]`,
              } as Part)
            }
          }
        }
      } catch (error) {
        await input.client.app.log({
          body: {
            service: "swe-sworm-plugin",
            level: "error",
            message: "Chat messages transform hook error",
            extra: { error: String(error) },
          },
        }).catch(() => {})
      }
    },

    "experimental.text.complete": async (
      hookInput: {
        sessionID: string
        messageID: string
        partID: string
      },
      hookOutput: {
        text: string
      }
    ) => {
      try {
        if (!input.enableTextCompleteHook) {
          return
        }

        if (input.strictPolicy.enabled && !input.strictPolicy.recordOnly) {
          hookOutput.text = `${hookOutput.text}\n[governance: verified-output, strict=${input.strictPolicy.enabled}]`
        }

        await appendAuditEntry(input.directory, {
          timestamp: new Date().toISOString(),
          sessionID: hookInput.sessionID,
          action: "text.complete",
          status: "allow",
          details: {
            messageID: hookInput.messageID,
            partID: hookInput.partID,
            strict: input.strictPolicy.enabled,
            recordOnly: input.strictPolicy.recordOnly,
            governance: input.governanceMetadata,
          },
        })
      } catch (error) {
        await input.client.app.log({
          body: {
            service: "swe-sworm-plugin",
            level: "error",
            message: "Text complete hook error",
            extra: { error: String(error) },
          },
        }).catch(() => {})
      }
    },
  }
}

function extractPermissionToolName(input: Permission): string {
  const metadataTool = input.metadata.tool
  if (typeof metadataTool === "string" && metadataTool.length > 0) {
    return metadataTool
  }

  const metadataToolName = input.metadata.toolName
  if (typeof metadataToolName === "string" && metadataToolName.length > 0) {
    return metadataToolName
  }

  return input.type
}

function extractPermissionArgs(input: Permission): Record<string, unknown> | undefined {
  const metadataArgs = input.metadata.args
  if (metadataArgs && typeof metadataArgs === "object" && !Array.isArray(metadataArgs)) {
    return metadataArgs as Record<string, unknown>
  }

  return undefined
}
