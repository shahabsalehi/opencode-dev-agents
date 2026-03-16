import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { describe, expect, it } from "vitest"
import { applyMviContext, discoverContextFiles } from "../../../src/context/context-scout.js"

async function createTmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "swe-context-"))
}

describe("context scout extended", () => {
  it("discovers markdown files across context directories", async () => {
    const dir = await createTmp()
    const coreDir = join(dir, ".opencode", "context", "core")
    const workflowDir = join(dir, ".opencode", "context", "workflows")

    await mkdir(coreDir, { recursive: true })
    await mkdir(workflowDir, { recursive: true })
    await writeFile(join(coreDir, "a.md"), "line1\nline2", "utf-8")
    await writeFile(join(workflowDir, "b.md"), "line3\nline4", "utf-8")
    await writeFile(join(workflowDir, "skip.txt"), "x", "utf-8")

    const files = await discoverContextFiles(dir)
    const kinds = files.map((f) => f.kind)

    expect(files.length).toBe(2)
    expect(kinds).toContain("core")
    expect(kinds).toContain("workflow")

    await rm(dir, { recursive: true, force: true })
  })

  it("applies max line budget per file", () => {
    const blocks = applyMviContext(
      [
        {
          path: "x",
          content: "one\ntwo\nthree",
          kind: "domain",
        },
      ],
      2
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toContain("one\ntwo")
    expect(blocks[0]).not.toContain("three")
  })
})
