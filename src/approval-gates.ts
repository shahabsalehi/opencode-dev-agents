export type ApprovalStatus = "pending" | "approved" | "denied" | "not-required"

export interface ApprovalRequest {
  callID: string
  tool: string
  sessionID: string
  timestamp: number
  description: string
  status: ApprovalStatus
  args: Record<string, unknown>
  reason?: string
  expiresAt?: number
  riskLevel?: "low" | "medium" | "high" | "critical"
  policyReason?: string
}

export interface ApprovalMetadata {
  riskLevel?: "low" | "medium" | "high" | "critical"
  policyReason?: string
}

export interface ApprovalGrant {
  tool: string
  sessionID: string
  pathPrefix?: string
  grantedAt: number
  expiresAt: number
  reason: string
}

export interface ApprovalGateConfig {
  protectedTools: Set<string>
  safeTools: Set<string>
}

export const DEFAULT_PROTECTED_TOOLS = new Set([
  "edit",
  "write",
  "bash",
  "testGenerator",
  "refactorEngine",
  "apply_patch",
])

export const DEFAULT_SAFE_TOOLS = new Set([
  "codeAnalyzer",
  "dependencyGraph",
  "bugDetector",
  "approval",
  "read",
  "grep",
  "glob",
  "ls",
  "delegation_read",
  "delegation_list",
  "thought_list",
  "external_scout",
  "reviewTool",
])

export class ApprovalStore {
  private sessions = new Map<string, SessionApprovalState>()
  private config: ApprovalGateConfig

  constructor(config: Partial<ApprovalGateConfig> = {}) {
    this.config = {
      protectedTools: config.protectedTools ?? DEFAULT_PROTECTED_TOOLS,
      safeTools: config.safeTools ?? DEFAULT_SAFE_TOOLS,
    }
  }

  requiresApproval(toolName: string): boolean {
    // Safe tools never require approval
    if (this.config.safeTools.has(toolName)) {
      return false
    }
    // Protected tools always require approval
    if (this.config.protectedTools.has(toolName)) {
      return true
    }
    // Default: require approval for unknown tools that might be destructive
    return true
  }

  getSessionState(sessionID: string): SessionApprovalState {
    if (!this.sessions.has(sessionID)) {
      this.sessions.set(sessionID, new SessionApprovalState(sessionID))
    }
    return this.sessions.get(sessionID)!
  }

  requestApproval(
    sessionID: string,
    callID: string,
    tool: string,
    args: Record<string, unknown>,
    metadata?: ApprovalMetadata
  ): ApprovalRequest {
    const session = this.getSessionState(sessionID)
    return session.createRequest(callID, tool, args, metadata)
  }

  approve(sessionID: string, callID: string, reason: string = "manual-approval", ttlMs: number = 10 * 60 * 1000): boolean {
    const session = this.getSessionState(sessionID)
    return session.approve(callID, reason, ttlMs)
  }

  deny(sessionID: string, callID: string): boolean {
    const session = this.getSessionState(sessionID)
    return session.deny(callID)
  }

  approveAllForSession(sessionID: string): number {
    const session = this.getSessionState(sessionID)
    return session.approveAll()
  }

  getPendingApprovals(sessionID: string): ApprovalRequest[] {
    const session = this.getSessionState(sessionID)
    return session.getPending()
  }

  isApproved(sessionID: string, callID: string): boolean {
    const session = this.getSessionState(sessionID)
    return session.isApproved(callID)
  }

  hasScopedGrant(sessionID: string, tool: string, args: Record<string, unknown> | undefined): boolean {
    const session = this.getSessionState(sessionID)
    return session.hasScopedGrant(tool, args)
  }

  cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now()
    let cleaned = 0
    for (const [sessionID, session] of this.sessions) {
      if (now - session.getLastActivity() > maxAgeMs) {
        this.sessions.delete(sessionID)
        cleaned++
      }
    }
    return cleaned
  }
}

export class SessionApprovalState {
  private requests = new Map<string, ApprovalRequest>()
  private grants: ApprovalGrant[] = []
  private lastActivity: number = Date.now()

  constructor(readonly sessionID: string) {}

  createRequest(callID: string, tool: string, args: Record<string, unknown>, metadata?: ApprovalMetadata): ApprovalRequest {
    this.touch()
    
    const request: ApprovalRequest = {
      callID,
      tool,
      sessionID: this.sessionID,
      timestamp: Date.now(),
      description: this.buildDescription(tool, args),
      status: "pending",
      args,
      riskLevel: metadata?.riskLevel,
      policyReason: metadata?.policyReason,
    }

    this.requests.set(callID, request)
    return request
  }

  approve(callID: string, reason: string, ttlMs: number): boolean {
    this.touch()
    const request = this.requests.get(callID)
    if (!request) return false
    request.status = "approved"
    request.reason = reason
    request.expiresAt = Date.now() + ttlMs

    const scopedPath = extractScopePath(request.args)
    this.grants.push({
      tool: request.tool,
      sessionID: this.sessionID,
      pathPrefix: scopedPath,
      grantedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      reason,
    })
    return true
  }

  deny(callID: string): boolean {
    this.touch()
    const request = this.requests.get(callID)
    if (!request) return false
    request.status = "denied"
    return true
  }

  approveAll(): number {
    this.touch()
    let count = 0
    for (const request of this.requests.values()) {
      if (request.status === "pending") {
        request.status = "approved"
        count++
      }
    }
    return count
  }

  getPending(): ApprovalRequest[] {
    this.touch()
    return Array.from(this.requests.values()).filter(r => r.status === "pending")
  }

  isApproved(callID: string): boolean {
    this.touch()
    const request = this.requests.get(callID)
    if (!request) return false
    if (request.status !== "approved") return false
    if (request.expiresAt && Date.now() > request.expiresAt) return false
    return true
  }

  hasScopedGrant(tool: string, args: Record<string, unknown> | undefined): boolean {
    this.touch()
    const now = Date.now()
    this.grants = this.grants.filter((grant) => grant.expiresAt > now)
    const currentPath = extractScopePath(args)

    return this.grants.some((grant) => {
      if (grant.tool !== tool) return false
      if (!grant.pathPrefix) return true
      if (!currentPath) return false
      return currentPath.startsWith(grant.pathPrefix)
    })
  }

  isDenied(callID: string): boolean {
    this.touch()
    const request = this.requests.get(callID)
    return request?.status === "denied"
  }

  getLastActivity(): number {
    return this.lastActivity
  }

  private touch(): void {
    this.lastActivity = Date.now()
  }

  private buildDescription(tool: string, args: Record<string, any>): string {
    const parts: string[] = [tool]
    
    if (args.target) parts.push(`target: ${args.target}`)
    if (args.filePath) parts.push(`file: ${args.filePath}`)
    if (args.path) parts.push(`path: ${args.path}`)
    if (args.command) parts.push(`command: ${args.command}`)
    if (args.files && Array.isArray(args.files)) {
      parts.push(`files: ${args.files.length} file(s)`)
    }
    if (args.sourceFiles && Array.isArray(args.sourceFiles)) {
      parts.push(`sourceFiles: ${args.sourceFiles.length} file(s)`)
    }

    return parts.join(" | ")
  }
}

function extractScopePath(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined
  const keys = ["filePath", "path", "target", "scope"]
  for (const key of keys) {
    const value = args[key]
    if (typeof value === "string" && value.trim().length > 0) {
      return value
    }
  }
  return undefined
}

/**
 * Format approval request for user display
 */
export function formatApprovalRequest(request: ApprovalRequest): string {
  const lines = [
    `🔒 Approval Required`,
    ``,
    `Tool: ${request.tool}`,
    `Description: ${request.description}`,
    ``,
    `This action may modify files or execute system commands.`,
    `Status: ${request.status === "pending" ? "⏳ Awaiting approval" : request.status === "approved" ? "✅ Approved" : "❌ Denied"}`,
    ``,
    `To approve: Use the approval command or approve all pending requests.`,
  ]
  return lines.join("\n")
}

/**
 * Format pending approvals list
 */
export function formatPendingApprovals(requests: ApprovalRequest[]): string {
  if (requests.length === 0) {
    return "No pending approvals."
  }

  const lines = [
    `Pending approvals (${requests.length}):`,
    ...requests.map((request) =>
      `- ${request.callID} | ${request.tool} | ${request.description}`
    ),
  ]

  return lines.join("\n")
}

/**
 * Format blocked action message
 */
export function formatBlockedMessage(request: ApprovalRequest): string {
  return [
    `❌ Action Blocked: Approval Required`,
    ``,
    `Tool: ${request.tool}`,
    `Call ID: ${request.callID}`,
    ``,
    `This action requires explicit approval before execution.`,
    `Request timestamp: ${new Date(request.timestamp).toISOString()}`,
    ``,
    `Use 'approve ${request.callID}' to approve this action,`,
    `or 'approve all' to approve all pending actions for this session.`,
  ].join("\n")
}

/**
 * Create singleton approval store instance
 */
export const approvalStore = new ApprovalStore()
