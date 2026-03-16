import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, it } from "vitest"
import { astGrepReplace, astGrepSearch } from "../../../src/tools/ast-tools.js"

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (!dir) continue
    await rm(dir, { recursive: true, force: true })
  }
})

describe("ast tools", () => {
  it("filters matches by requested language", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swarm-ast-"))
    tempDirs.push(directory)

    const jsFile = join(directory, "sample.js")
    const pyFile = join(directory, "sample.py")
    await writeFile(jsFile, "const value = 1\nconsole.log(value)\n", "utf-8")
    await writeFile(pyFile, "value = 1\nprint(value)\n", "utf-8")

    const output = await astGrepSearch.execute(
      {
        pattern: "console.log($ARG)",
        lang: "javascript",
        paths: [directory],
        globs: []
      },
      { directory } as never
    )

    expect(output).toContain("sample.js")
    expect(output).not.toContain("sample.py")
  })

  it("keeps files unchanged in dry-run mode", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swarm-ast-"))
    tempDirs.push(directory)

    const jsFile = join(directory, "replace.js")
    await writeFile(jsFile, "const value = 1\nconsole.log(value)\n", "utf-8")

    const output = await astGrepReplace.execute(
      {
        pattern: "console.log($ARG)",
        rewrite: "logger.info($ARG)",
        dryRun: true,
        lang: "javascript",
        paths: [directory],
        globs: []
      },
      { directory } as never
    )

    const contentAfter = await readFile(jsFile, "utf-8")
    expect(output).toContain("Dry Run")
    expect(contentAfter).toContain("console.log(value)")
    expect(contentAfter).not.toContain("logger.info(value)")
  })

  it("writes replacements when dryRun is false", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swarm-ast-"))
    tempDirs.push(directory)

    const jsFile = join(directory, "replace-live.js")
    await writeFile(jsFile, "const value = 1\nconsole.log(value)\n", "utf-8")

    const output = await astGrepReplace.execute(
      {
        pattern: "console.log($ARG)",
        rewrite: "logger.info($ARG)",
        dryRun: false,
        lang: "javascript",
        paths: [directory],
        globs: []
      },
      { directory } as never
    )

    const contentAfter = await readFile(jsFile, "utf-8")
    expect(output).toContain("Live (changes written)")
    expect(contentAfter).toContain("logger.info(value)")
    expect(contentAfter).not.toContain("console.log(value)")
  })
})
