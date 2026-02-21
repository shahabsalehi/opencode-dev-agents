import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, it } from "vitest"
import { testGenerator } from "../../../src/tools/test-generator.js"

type GeneratorResult = {
  details: string
}

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (!dir) continue
    await rm(dir, { recursive: true, force: true })
  }
})

function parseDetails(output: string): string {
  return (JSON.parse(output) as GeneratorResult).details
}

describe("testGenerator framework auto-detection", () => {
  it("prefers vitest over jest on score tie", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swarm-testgen-"))
    tempDirs.push(directory)

    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "fixture",
        version: "1.0.0",
        devDependencies: {
          jest: "^29.0.0",
          vitest: "^4.0.0"
        }
      }, null, 2),
      "utf-8"
    )

    await writeFile(join(directory, "foo.ts"), "export function add(a: number, b: number) { return a + b }\n", "utf-8")

    const output = await testGenerator.execute(
      {
        sourceFiles: ["foo.ts"],
        framework: "auto",
        includePrivate: false,
        diffOnly: false
      },
      { directory, metadata: () => undefined } as never
    )

    const details = parseDetails(output)
    expect(details).toContain("**Framework:** vitest (auto-detected)")
  })

  it("falls back to pytest when python sources dominate and no framework signal exists", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swarm-testgen-"))
    tempDirs.push(directory)

    await writeFile(join(directory, "math_utils.py"), "def add(a, b):\n    return a + b\n", "utf-8")

    const output = await testGenerator.execute(
      {
        sourceFiles: ["math_utils.py"],
        framework: "auto",
        includePrivate: false,
        diffOnly: false
      },
      { directory, metadata: () => undefined } as never
    )

    const details = parseDetails(output)
    expect(details).toContain("**Framework:** pytest (auto-detected)")

    const generated = await readFile(join(directory, "test_math_utils.py"), "utf-8")
    expect(generated).toContain("import pytest")
  })
})
