export type MutationCluster = {
  clusterID: string
  rationale: string
  files: string[]
}

export function buildMutationClusters(files: string[]): MutationCluster[] {
  const byPrefix = new Map<string, string[]>()

  for (const file of files) {
    const normalized = file.replace(/\\/g, "/")
    const parts = normalized.split("/")
    const prefix = parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0]
    const existing = byPrefix.get(prefix) ?? []
    existing.push(file)
    byPrefix.set(prefix, existing)
  }

  return Array.from(byPrefix.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([prefix, grouped], index) => ({
      clusterID: `cluster-${index + 1}`,
      rationale: `Group by module prefix '${prefix}' to reduce unrelated edit coupling.`,
      files: grouped.sort((a, b) => a.localeCompare(b)),
    }))
}
