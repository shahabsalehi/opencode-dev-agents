export type DiffChange = {
  file: string
  additions: number
  deletions: number
}

export function rankDiffChanges(changes: DiffChange[]): DiffChange[] {
  return [...changes].sort((a, b) => {
    const weightA = a.additions + a.deletions
    const weightB = b.additions + b.deletions
    if (weightA !== weightB) {
      return weightB - weightA
    }
    return a.file.localeCompare(b.file)
  })
}

export function selectTopChangedFiles(changes: DiffChange[], limit: number): string[] {
  if (limit <= 0) {
    return []
  }
  return rankDiffChanges(changes)
    .slice(0, limit)
    .map((change) => change.file)
}

export function hasDiffPressure(changes: DiffChange[], threshold: number): boolean {
  if (threshold <= 0) {
    return changes.length > 0
  }
  return changes.some((change) => change.additions + change.deletions >= threshold)
}
