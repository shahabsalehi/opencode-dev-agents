type RankedContext = {
  block: string
  score: number
}

const KIND_SCORE: Record<string, number> = {
  core: 100,
  project: 80,
  workflow: 60,
  domain: 40,
}

function blockKind(block: string): string {
  const kindMatch = /## Context \(([^)]+)\)/.exec(block)
  if (!kindMatch) return "domain"
  return kindMatch[1]
}

function relevanceScore(block: string, activeHints: string[]): number {
  if (activeHints.length === 0) return 0
  const lower = block.toLowerCase()
  return activeHints.reduce((score, hint) => {
    const normalized = hint.toLowerCase().trim()
    if (!normalized) return score
    return lower.includes(normalized) ? score + 15 : score
  }, 0)
}

export function rankContextBlocks(blocks: string[], activeHints: string[] = []): string[] {
  const ranked: RankedContext[] = blocks.map((block, index) => {
    const kind = blockKind(block)
    const baseScore = KIND_SCORE[kind] ?? 20
    const score = baseScore + relevanceScore(block, activeHints) - index * 0.01
    return { block, score }
  })

  ranked.sort((a, b) => b.score - a.score)
  return ranked.map((item) => item.block)
}

export function budgetContextBlocks(blocks: string[], maxBlocks: number): string[] {
  if (maxBlocks <= 0) return []
  return blocks.slice(0, maxBlocks)
}
