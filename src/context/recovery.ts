export type ContextRecoveryResult = {
  blocks: string[]
  truncated: boolean
}

export function recoverContextBlocks(blocks: string[], maxChars: number): ContextRecoveryResult {
  if (maxChars <= 0) {
    return { blocks: [], truncated: blocks.length > 0 }
  }

  const recovered: string[] = []
  let budget = maxChars
  let truncated = false

  for (const block of blocks) {
    if (budget <= 0) {
      truncated = true
      break
    }

    if (block.length <= budget) {
      recovered.push(block)
      budget -= block.length
      continue
    }

    recovered.push(block.slice(0, budget))
    budget = 0
    truncated = true
  }

  return {
    blocks: recovered,
    truncated,
  }
}
