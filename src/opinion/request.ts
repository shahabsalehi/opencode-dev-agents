import { opinionFailSafeForTier, parseOpinionResponse } from "./parse-response.js"
import type { OpinionTier, SecondOpinionRequest, SecondOpinionResponse } from "./types.js"
import { isTransientError, withRetries } from "../utils/retry.js"

type MessagePart = { type: string; text?: string }
type SessionMessage = { info?: { role?: string }; parts?: MessagePart[] }

type OpinionClient = {
  session: {
    create(args: { body: { title: string; parentID: string } }): Promise<{ data?: { id?: string } }>
    prompt(args: {
      path: { id: string }
      body: { agent?: string; parts: Array<{ type: "text"; text: string }>; noReply?: boolean }
    }): Promise<unknown>
    messages(args: { path: { id: string } }): Promise<{ data?: SessionMessage[] }>
  }
}

export async function requestSecondOpinion(input: {
  client: OpinionClient
  request: SecondOpinionRequest
  agent: string
  timeoutMs: number
  tier: OpinionTier
}): Promise<SecondOpinionResponse> {
  try {
    const result = await withTimeout(async () => {
      const created = await input.client.session.create({
        body: {
          title: `Second Opinion ${input.request.toolName}`,
          parentID: input.request.sessionID,
        },
      })

      const sessionID = created.data?.id
      if (!sessionID) {
        return opinionFailSafeForTier(input.tier)
      }

      const prompt = buildOpinionPrompt(input.request)
      await withRetries(
        async () => input.client.session.prompt({
          path: { id: sessionID },
          body: {
            agent: input.agent,
            parts: [{ type: "text", text: prompt }],
          },
        }),
        { attempts: 2, delayMs: 120, maxDelayMs: 400 },
        isTransientError
      )

      const responseText = await waitForAssistantText(input.client, sessionID)
      if (!responseText) {
        return opinionFailSafeForTier(input.tier)
      }

      return parseOpinionResponse(responseText, input.tier)
    }, input.timeoutMs)

    return result ?? opinionFailSafeForTier(input.tier)
  } catch {
    return opinionFailSafeForTier(input.tier)
  }
}

function buildOpinionPrompt(request: SecondOpinionRequest): string {
  const args = JSON.stringify(request.toolArgs ?? {}, null, 0)
  const content = request.planContent.slice(0, 2000)
  return [
    "You are a governance second-opinion reviewer. Return ONLY JSON.",
    "Do not call tools. Do not propose broad rewrites. Be concise and concrete.",
    `Plan title: ${request.planTitle}`,
    `Plan content: ${content}`,
    `Tool: ${request.toolName}`,
    `Args: ${args}`,
    `Mutation count: ${request.mutationCount}`,
    `Policy risk: ${request.policyRisk}`,
    "",
    "Output schema:",
    '{"verdict":"proceed|caution|escalate","risks":["..."],"suggestion":"... or null","confidence":0.0}',
  ].join("\n")
}

async function waitForAssistantText(client: OpinionClient, sessionID: string): Promise<string | null> {
  const maxAttempts = 5
  for (let i = 0; i < maxAttempts; i++) {
    const messages = await withRetries(
      async () => client.session.messages({ path: { id: sessionID } }),
      { attempts: 2, delayMs: 100, maxDelayMs: 300 },
      isTransientError
    )
    const text = extractLastAssistantText(messages.data ?? [])
    if (text.length > 0) {
      return text
    }
    await sleep(300)
  }
  return null
}

function extractLastAssistantText(messages: SessionMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.info?.role !== "assistant") continue
    const text = (message.parts ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join("\n")
      .trim()
    if (text.length > 0) return text
  }
  return ""
}

async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T | null> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(null), timeoutMs)
    if (timeoutHandle && typeof timeoutHandle === "object" && "unref" in timeoutHandle) {
      timeoutHandle.unref()
    }
  })
  const result = await Promise.race([operation(), timeoutPromise])
  if (timeoutHandle) {
    clearTimeout(timeoutHandle)
  }
  return result as T | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
