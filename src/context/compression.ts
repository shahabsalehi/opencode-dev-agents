export type CompressionStats = {
  totalLines: number
  maxLines: number
  trimmedLines: number
}

export function compressContextBlocks(blocks: string[], maxTotalLines: number): {
  blocks: string[]
  stats: CompressionStats
} {
  const sections = blocks.flatMap((block) => splitSections(block))
  const lines = sections.flatMap((section) => section.lines)
  if (lines.length <= maxTotalLines) {
    return {
      blocks,
      stats: {
        totalLines: lines.length,
        maxLines: maxTotalLines,
        trimmedLines: 0
      }
    }
  }

  const trimmed = trimSections(sections, maxTotalLines)
  return {
    blocks: [trimmed.join("\n")],
    stats: {
      totalLines: lines.length,
      maxLines: maxTotalLines,
      trimmedLines: lines.length - maxTotalLines
    }
  }
}

type Section = {
  header: string
  lines: string[]
}

function splitSections(block: string): Section[] {
  const lines = block.split("\n")
  const sections: Section[] = []
  let current: Section | null = null

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (current) sections.push(current)
      current = { header: line, lines: [line] }
      continue
    }
    if (!current) {
      current = { header: "", lines: [] }
    }
    current.lines.push(line)
  }

  if (current) sections.push(current)
  return sections
}

function trimSections(sections: Section[], maxLines: number): string[] {
  const result: string[] = []
  let remaining = maxLines

  for (const section of sections) {
    if (remaining <= 0) break
    const lines = section.lines
    if (lines.length <= remaining) {
      result.push(...lines)
      remaining -= lines.length
      continue
    }

    if (section.header) {
      result.push(section.header)
      remaining -= 1
    }

    if (remaining <= 0) break
    const body = lines.slice(section.header ? 1 : 0, (section.header ? 1 : 0) + remaining)
    result.push(...body)
    remaining = 0
  }

  return result
}
