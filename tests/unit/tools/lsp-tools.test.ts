import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, it } from "vitest"
import { lspDiagnostics, lspGotoDefinition } from "../../../src/tools/lsp-tools.js"

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (!dir) continue
    await rm(dir, { recursive: true, force: true })
  }
})

describe("lsp tools", () => {
  it("returns clear error when file extension has no configured server", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swarm-lsp-"))
    tempDirs.push(directory)

    const filePath = join(directory, "notes.txt")
    await writeFile(filePath, "hello", "utf-8")

    const output = await lspGotoDefinition.execute(
      { filePath, line: 1, character: 0 },
      { directory } as never
    )

    expect(output).toContain("No configured language server")
  })

  it("returns install hint when server executable is missing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swarm-lsp-"))
    tempDirs.push(directory)

    const filePath = join(directory, "missing.ts")
    await writeFile(filePath, "export const a = 1\n", "utf-8")

    const originalPath = process.env.PATH
    process.env.PATH = ""
    try {
      const output = await lspDiagnostics.execute(
        { filePath, severity: "all" },
        { directory } as never
      )

      expect(output).toContain("No language server executable found for 'typescript'")
      expect(output).toContain("typescript-language-server")
    } finally {
      process.env.PATH = originalPath
    }
  })

  it("collects diagnostics from publishDiagnostics notification", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swarm-lsp-"))
    tempDirs.push(directory)

    const lspServerPath = join(directory, "typescript-language-server")
    const serverScript = `#!/usr/bin/env node
let buffer = ""

function send(message) {
  const text = JSON.stringify(message)
  process.stdout.write("Content-Length: " + Buffer.byteLength(text) + "\\r\\n\\r\\n" + text)
}

function processBuffer() {
  while (true) {
    const header = /Content-Length: (\\d+)\\r\\n\\r\\n/.exec(buffer)
    if (!header) return
    const start = header.index + header[0].length
    const length = Number(header[1])
    if (buffer.length < start + length) return

    const raw = buffer.slice(start, start + length)
    buffer = buffer.slice(start + length)
    const msg = JSON.parse(raw)

    if (msg.id && msg.method === "initialize") {
      send({ jsonrpc: "2.0", id: msg.id, result: { capabilities: {} } })
      continue
    }

    if (msg.method === "textDocument/didOpen") {
      send({
        jsonrpc: "2.0",
        method: "textDocument/publishDiagnostics",
        params: {
          uri: msg.params.textDocument.uri,
          diagnostics: [{
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            severity: 1,
            message: "fake diagnostic"
          }]
        }
      })
    }
  }
}

process.stdin.on("data", (chunk) => {
  buffer += chunk.toString()
  processBuffer()
})
`
    await writeFile(lspServerPath, serverScript, "utf-8")
    await chmod(lspServerPath, 0o755)

    const filePath = join(directory, "diag.ts")
    await writeFile(filePath, "const x: number = 'oops'\n", "utf-8")

    const originalPath = process.env.PATH
    process.env.PATH = `${directory}${originalPath ? `:${originalPath}` : ""}`
    try {
      const output = await lspDiagnostics.execute(
        { filePath, severity: "all" },
        { directory } as never
      )

      expect(output).toContain("[ERROR] Line 1: fake diagnostic")
    } finally {
      process.env.PATH = originalPath
    }
  })
})
