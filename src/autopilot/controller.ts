import { shouldAutoPause } from "./risk-accumulator.js"

type SessionState = {
  stepCount: number
  cumulativeRisk: number
  lastTool?: string
  paused: boolean
}

export class AutopilotController {
  private readonly sessions = new Map<string, SessionState>()

  constructor(
    private readonly threshold: number,
    private readonly maxStepsBeforePause: number,
  ) {}

  startStep(sessionID: string, toolName: string): void {
    const state = this.getOrCreate(sessionID)
    state.stepCount += 1
    state.lastTool = toolName
  }

  completeStep(sessionID: string, stepRisk: number): void {
    const state = this.getOrCreate(sessionID)
    state.cumulativeRisk += Math.max(0, stepRisk)
    if (shouldAutoPause(state.cumulativeRisk, this.threshold) || state.stepCount >= this.maxStepsBeforePause) {
      state.paused = true
    }
  }

  shouldPause(sessionID: string): boolean {
    return this.getOrCreate(sessionID).paused
  }

  resume(sessionID: string): void {
    const state = this.getOrCreate(sessionID)
    state.paused = false
    state.stepCount = 0
    state.cumulativeRisk = 0
  }

  getStatus(sessionID: string): {
    stepCount: number
    cumulativeRisk: number
    threshold: number
    maxStepsBeforePause: number
    paused: boolean
    lastTool?: string
  } {
    const state = this.getOrCreate(sessionID)
    return {
      stepCount: state.stepCount,
      cumulativeRisk: Number(state.cumulativeRisk.toFixed(3)),
      threshold: this.threshold,
      maxStepsBeforePause: this.maxStepsBeforePause,
      paused: state.paused,
      lastTool: state.lastTool,
    }
  }

  private getOrCreate(sessionID: string): SessionState {
    const existing = this.sessions.get(sessionID)
    if (existing) return existing
    const next: SessionState = {
      stepCount: 0,
      cumulativeRisk: 0,
      paused: false,
    }
    this.sessions.set(sessionID, next)
    return next
  }
}
