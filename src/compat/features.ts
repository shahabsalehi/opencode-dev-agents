import { DEFAULTS, getConfig } from "../config.js"

export type FeatureFlags = {
  enableExperimentalCompaction: boolean
  enableSystemTransform: boolean
  enableDelegationRuntime: boolean
  enableVerificationContract: boolean
  enableChatMessagesTransform: boolean
  enableTextCompleteHook: boolean
  enableAuthHook: boolean
  enableCompactionRescue: boolean
}

export function resolveFeatureFlags(): FeatureFlags {
  const config = getConfig()
  const compat = config.compatibility
  const defaults = DEFAULTS.compatibility

  return {
    enableExperimentalCompaction:
      compat?.enableExperimentalCompaction ?? defaults.enableExperimentalCompaction,
    enableSystemTransform: compat?.enableSystemTransform ?? defaults.enableSystemTransform,
    enableDelegationRuntime: compat?.enableDelegationRuntime ?? defaults.enableDelegationRuntime,
    enableVerificationContract:
      compat?.enableVerificationContract ?? defaults.enableVerificationContract,
    enableChatMessagesTransform:
      compat?.enableChatMessagesTransform ?? defaults.enableChatMessagesTransform,
    enableTextCompleteHook:
      compat?.enableTextCompleteHook ?? defaults.enableTextCompleteHook,
    enableAuthHook: compat?.enableAuthHook ?? defaults.enableAuthHook,
    enableCompactionRescue:
      compat?.enableCompactionRescue ?? defaults.enableCompactionRescue,
  }
}
