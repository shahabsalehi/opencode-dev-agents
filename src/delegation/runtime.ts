import { appendAuditEntry } from "../audit/logger.js"
import { readDelegation, saveDelegation, updateDelegation, type DelegationRecord } from "./store.js"
import { isTransientError, withRetries } from "../utils/retry.js"

type MessagePart = { type: string; text?: string }
type SessionMessage = { info: { role: string }; parts: MessagePart[] }

type SessionClient = {
  create(args: { body: { title: string; parentID: string } }): Promise<{ data?: { id?: string } }>
  prompt(args: {
    path: { id: string }
    body: { agent?: string; parts: Array<{ type: "text"; text: string }>; noReply?: boolean }
  }): Promise<unknown>
  messages(args: { path: { id: string } }): Promise<{ data?: SessionMessage[] }>
}

type AppClient = {
  log(args: {
    body: {
      service: string
      level: "debug" | "info" | "warn" | "error"
      message: string
      extra?: Record<string, unknown>
    }
  }): Promise<unknown>
}

export type RuntimeClient = {
  session: SessionClient
  app: AppClient
}

type RuntimeRecord = {
  delegationID: string
  sessionID: string
  parentSessionID: string
  parentAgent?: string
  startedAt: number
}

export class DelegationRuntime {
  private bySession = new Map<string, RuntimeRecord>()
  private pendingByParent = new Map<string, Set<string>>()

  constructor(private readonly client: RuntimeClient, private readonly directory: string) {}

  async start(input: {
    delegationID: string
    prompt: string
    agent: string
    parentSessionID: string
    parentAgent?: string
  }): Promise<{ delegationID: string; sessionID: string }> {
    const created = await withRetries(
      async () => this.client.session.create({
        body: {
          title: `Delegation ${input.delegationID}`,
          parentID: input.parentSessionID,
        },
      }),
      { attempts: 2, delayMs: 120, maxDelayMs: 400 },
      isTransientError
    )

    const sessionID = created.data?.id
    if (!sessionID) {
      throw new Error("Failed to create delegated session")
    }

    const delegation = await readDelegation(this.directory, input.delegationID)
    if (!delegation) {
      throw new Error(`Delegation not found: ${input.delegationID}`)
    }

    await saveDelegation(this.directory, {
      ...delegation,
      status: "running",
      sessionID,
    })

    this.bySession.set(sessionID, {
      delegationID: input.delegationID,
      sessionID,
      parentSessionID: input.parentSessionID,
      parentAgent: input.parentAgent,
      startedAt: Date.now(),
    })

    const pendingSet = this.pendingByParent.get(input.parentSessionID) ?? new Set<string>()
    pendingSet.add(input.delegationID)
    this.pendingByParent.set(input.parentSessionID, pendingSet)

    await withRetries(
      async () => this.client.session.prompt({
        path: { id: sessionID },
        body: {
          agent: input.agent,
          parts: [{ type: "text", text: input.prompt }],
          noReply: true,
        },
      }),
      { attempts: 2, delayMs: 120, maxDelayMs: 400 },
      isTransientError
    )

    await appendAuditEntry(this.directory, {
      timestamp: new Date().toISOString(),
      sessionID: input.parentSessionID,
      action: "delegation.start",
      status: "info",
      details: {
        delegationID: input.delegationID,
        childSessionID: sessionID,
        agent: input.agent,
      },
    })

    return { delegationID: input.delegationID, sessionID }
  }

  async handleSessionIdle(sessionID: string): Promise<void> {
    const runtime = this.bySession.get(sessionID)
    if (!runtime) return

    const messages = await withRetries(
      async () => this.client.session.messages({ path: { id: sessionID } }),
      { attempts: 2, delayMs: 120, maxDelayMs: 400 },
      isTransientError
    )
    const lastAssistantText = extractLastAssistantText(messages.data ?? [])

    const updated = await updateDelegation(this.directory, runtime.delegationID, {
      status: "completed",
      result: lastAssistantText || "Delegation completed with no textual output.",
      completedAt: Date.now(),
    })

    await this.notifyParent(runtime, {
      status: "completed",
      result: lastAssistantText || "Delegation completed with no textual output.",
    })

    await appendAuditEntry(this.directory, {
      timestamp: new Date().toISOString(),
      sessionID: runtime.parentSessionID,
      action: "delegation.complete",
      status: updated ? "allow" : "error",
      details: {
        delegationID: runtime.delegationID,
        childSessionID: runtime.sessionID,
        elapsedMs: Date.now() - runtime.startedAt,
      },
    })

    this.bySession.delete(sessionID)
  }

  async handleSessionError(sessionID: string, error: string): Promise<void> {
    const runtime = this.bySession.get(sessionID)
    if (!runtime) return

    await updateDelegation(this.directory, runtime.delegationID, {
      status: "error",
      result: error,
      completedAt: Date.now(),
    })

    await this.notifyParent(runtime, {
      status: "error",
      result: error,
    })

    await appendAuditEntry(this.directory, {
      timestamp: new Date().toISOString(),
      sessionID: runtime.parentSessionID,
      action: "delegation.error",
      status: "error",
      details: {
        delegationID: runtime.delegationID,
        childSessionID: runtime.sessionID,
        error,
      },
    })

    this.bySession.delete(sessionID)
  }

  getActiveCount(): number {
    return this.bySession.size
  }

  getActiveCountForParent(parentSessionID: string): number {
    return this.pendingByParent.get(parentSessionID)?.size ?? 0
  }

  hasPendingForParent(parentSessionID: string): boolean {
    return this.getActiveCountForParent(parentSessionID) > 0
  }

  private async notifyParent(
    runtime: RuntimeRecord,
    completion: { status: "completed" | "error"; result: string }
  ): Promise<void> {
    const pendingSet = this.pendingByParent.get(runtime.parentSessionID)
    if (pendingSet) {
      pendingSet.delete(runtime.delegationID)
      if (pendingSet.size === 0) {
        this.pendingByParent.delete(runtime.parentSessionID)
      }
    }
    const remaining = pendingSet?.size ?? 0

    const statusPrefix = completion.status === "completed" ? "✅" : "❌"
    const message = [
      `<task-notification>`,
      `<task-id>${runtime.delegationID}</task-id>`,
      `<status>${completion.status}</status>`,
      `<summary>${statusPrefix} Delegation ${runtime.delegationID} ${completion.status}</summary>`,
      `<result>${completion.result.slice(0, 1000)}</result>`,
      `</task-notification>`,
      remaining > 0
        ? `\n${remaining} delegation(s) still running. Continue productive work; do not poll.`
        : `\nAll delegations complete.`,
    ].join("\n")

    await this.client.session.prompt({
      path: { id: runtime.parentSessionID },
      body: {
        agent: runtime.parentAgent,
        parts: [{ type: "text", text: message }],
        noReply: remaining > 0,
      },
    })
  }
}

function extractLastAssistantText(messages: SessionMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.info.role !== "assistant") continue
    const text = message.parts
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join("\n")
      .trim()
    if (text.length > 0) return text
  }
  return ""
}

export function buildDelegationRecord(input: {
  id: string
  prompt: string
  agent: string
}): DelegationRecord {
  return {
    id: input.id,
    prompt: input.prompt,
    agent: input.agent,
    createdAt: Date.now(),
    status: "pending",
  }
}
