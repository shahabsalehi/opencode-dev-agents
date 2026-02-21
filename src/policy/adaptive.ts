import type { AdaptiveStrictnessLevel, AdaptiveStrictnessSignals } from "./types.js"

export function evaluateAdaptiveStrictness(signals: AdaptiveStrictnessSignals): AdaptiveStrictnessLevel {
  if (
    signals.failedVerificationCount >= 3 ||
    (signals.mutationCount >= 15 && signals.largeDiffDetected)
  ) {
    return "lockdown"
  }

  if (
    signals.mutationCount >= 8 ||
    signals.mutationToolRatio > 0.7 ||
    signals.failedVerificationCount >= 1 ||
    signals.largeDiffDetected
  ) {
    return "elevated"
  }

  if (signals.mutationCount === 0 && signals.mutationToolRatio === 0) {
    return "relaxed"
  }

  return "normal"
}
