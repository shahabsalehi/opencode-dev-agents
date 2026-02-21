import type { PolicyDecision, PolicyRisk } from "../policy/types.js"

export type SessionRunState = {
  sessionID: string
  startedAt: number
  lastUpdatedAt: number
  toolCalls: number
  filesModified: number
  policy: {
    allow: number
    deny: number
    needsApproval: number
    byRisk: Record<PolicyRisk, number>
  }
}

function makeState(sessionID: string): SessionRunState {
  const now = Date.now()
  return {
    sessionID,
    startedAt: now,
    lastUpdatedAt: now,
    toolCalls: 0,
    filesModified: 0,
    policy: {
      allow: 0,
      deny: 0,
      needsApproval: 0,
      byRisk: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      },
    },
  }
}

export class RunLedger {
  private sessions = new Map<string, SessionRunState>()

  get(sessionID: string): SessionRunState {
    if (!this.sessions.has(sessionID)) {
      this.sessions.set(sessionID, makeState(sessionID))
    }
    return this.sessions.get(sessionID)!
  }

  recordToolCall(sessionID: string): void {
    const state = this.get(sessionID)
    state.toolCalls += 1
    state.lastUpdatedAt = Date.now()
  }

  recordMutation(sessionID: string): void {
    const state = this.get(sessionID)
    state.filesModified += 1
    state.lastUpdatedAt = Date.now()
  }

  recordPolicyDecision(sessionID: string, decision: PolicyDecision, risk: PolicyRisk): void {
    const state = this.get(sessionID)
    if (decision === "allow") state.policy.allow += 1
    if (decision === "deny") state.policy.deny += 1
    if (decision === "needs-approval") state.policy.needsApproval += 1
    state.policy.byRisk[risk] += 1
    state.lastUpdatedAt = Date.now()
  }

  toJSON(): SessionRunState[] {
    return Array.from(this.sessions.values()).map((state) => ({
      ...state,
      policy: {
        ...state.policy,
        byRisk: { ...state.policy.byRisk },
      },
    }))
  }

  load(states: SessionRunState[]): void {
    this.sessions.clear()
    for (const state of states) {
      this.sessions.set(state.sessionID, {
        ...state,
        policy: {
          ...state.policy,
          byRisk: { ...state.policy.byRisk },
        },
      })
    }
  }
}
