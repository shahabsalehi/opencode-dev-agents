import { tool } from "@opencode-ai/plugin/tool"
import { promises as fs } from "fs"
import { resolve, extname } from "path"

interface LSPPosition {
  line: number
  character: number
}

interface LSPRange {
  start: LSPPosition
  end: LSPPosition
}

interface LSPLocation {
  uri: string
  range: LSPRange
}

interface LSPSymbol {
  name: string
  kind: number
  location: LSPLocation
  containerName?: string
}

interface LSPDiagnostic {
  range: LSPRange
  severity: number
  code?: string | number
  source?: string
  message: string
}

const LANGUAGE_SERVERS: Record<string, {
  commandCandidates: string[][]
  extensions: string[]
  installHint: string
}> = {
  typescript: {
    commandCandidates: [["typescript-language-server", "--stdio"]],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    installHint: "Install TypeScript LSP server (for example: npm install -g typescript-language-server typescript)."
  },
  python: {
    commandCandidates: [["pyright-langserver", "--stdio"], ["pylsp"]],
    extensions: [".py"],
    installHint: "Install Python LSP server (for example: npm install pyright or pip install python-lsp-server)."
  },
  rust: {
    commandCandidates: [["rust-analyzer"]],
    extensions: [".rs"],
    installHint: "Install rust-analyzer and ensure it is available in PATH."
  },
  go: {
    commandCandidates: [["gopls"]],
    extensions: [".go"],
    installHint: "Install gopls and ensure it is available in PATH (go install golang.org/x/tools/gopls@latest)."
  }
}

function findLanguageServer(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase()
  for (const [lang, config] of Object.entries(LANGUAGE_SERVERS)) {
    if (config.extensions.includes(ext)) {
      return lang
    }
  }
  return null
}

class SimpleLSPClient {
  private process: ReturnType<typeof import("child_process")["spawn"]> | null = null
  private requestId = 0
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>()
  private diagnosticsByUri = new Map<string, LSPDiagnostic[]>()
  private openDocuments = new Set<string>()
  private buffer = ""
  private initialized = false

  constructor(private command: string[]) {}

  async initialize(workspacePath: string): Promise<void> {
    const { spawn } = await import("child_process")
    this.process = spawn(this.command[0], this.command.slice(1), {
      stdio: ["pipe", "pipe", "pipe"]
    })

    if (!this.process.stdin || !this.process.stdout) {
      throw new Error("Failed to spawn LSP process")
    }

    this.process.stdout.on("data", (data: Buffer) => {
      this.buffer += data.toString()
      this.processBuffer()
    })

    this.process.stderr?.on("data", (data: Buffer) => {
      console.error("LSP stderr:", data.toString())
    })

    // Initialize
    await this.sendRequest("initialize", {
      processId: process.pid,
      rootUri: `file://${workspacePath}`,
      capabilities: {},
      workspaceFolders: null
    })
    this.sendNotification("initialized", {})

    this.initialized = true
  }

  private processBuffer(): void {
    while (true) {
      const headerMatch = this.buffer.match(/Content-Length: (\d+)\r\n\r\n/)
      if (!headerMatch) break

      const contentLength = parseInt(headerMatch[1], 10)
      const headerLength = headerMatch[0].length
      const messageLength = headerLength + contentLength

      if (this.buffer.length < messageLength) break

      const message = this.buffer.slice(headerLength, messageLength)
      this.buffer = this.buffer.slice(messageLength)

      try {
        const parsed = JSON.parse(message)
        if (parsed.id !== undefined && this.pendingRequests.has(parsed.id)) {
          const { resolve, reject } = this.pendingRequests.get(parsed.id)!
          this.pendingRequests.delete(parsed.id)
          if (parsed.error) {
            reject(new Error(parsed.error.message))
          } else {
            resolve(parsed.result)
          }
          continue
        }

        if (parsed.method === "textDocument/publishDiagnostics") {
          const params = parsed.params as { uri?: string; diagnostics?: LSPDiagnostic[] } | undefined
          if (params?.uri) {
            this.diagnosticsByUri.set(params.uri, Array.isArray(params.diagnostics) ? params.diagnostics : [])
          }
        }
      } catch (e) {
        console.error("Failed to parse LSP message:", e)
      }
    }
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error("LSP process not initialized"))
        return
      }

      const id = ++this.requestId
      this.pendingRequests.set(id, { resolve, reject })

      const message = JSON.stringify({ jsonrpc: "2.0", id, method, params })
      const fullMessage = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`

      this.process.stdin.write(fullMessage)
    })
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.process?.stdin) {
      return
    }
    const message = JSON.stringify({ jsonrpc: "2.0", method, params })
    const fullMessage = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`
    this.process.stdin.write(fullMessage)
  }

  private async ensureDocumentOpened(filePath: string): Promise<string> {
    if (!this.initialized) throw new Error("LSP client not initialized")

    const uri = `file://${resolve(filePath)}`
    if (this.openDocuments.has(uri)) {
      return uri
    }

    this.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: findLanguageServer(filePath) || "text",
        version: 1,
        text: await fs.readFile(filePath, "utf-8")
      }
    })
    this.openDocuments.add(uri)
    return uri
  }

  private async waitForDiagnostics(uri: string, timeoutMs = 1500): Promise<LSPDiagnostic[]> {
    const existing = this.diagnosticsByUri.get(uri)
    if (existing) {
      return existing
    }

    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const value = this.diagnosticsByUri.get(uri)
      if (value) {
        return value
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
    }

    return this.diagnosticsByUri.get(uri) || []
  }

  async definition(filePath: string, line: number, character: number): Promise<LSPLocation | LSPLocation[] | null> {
    if (!this.initialized) throw new Error("LSP client not initialized")

    const uri = await this.ensureDocumentOpened(filePath)

    const result = await this.sendRequest("textDocument/definition", {
      textDocument: { uri },
      position: { line: line - 1, character }
    })

    return result as LSPLocation | LSPLocation[] | null
  }

  async references(filePath: string, line: number, character: number, includeDeclaration = true): Promise<LSPLocation[] | null> {
    if (!this.initialized) throw new Error("LSP client not initialized")

    const uri = await this.ensureDocumentOpened(filePath)

    const result = await this.sendRequest("textDocument/references", {
      textDocument: { uri },
      position: { line: line - 1, character },
      context: { includeDeclaration }
    })

    return result as LSPLocation[] | null
  }

  async documentSymbols(filePath: string): Promise<LSPSymbol[] | null> {
    if (!this.initialized) throw new Error("LSP client not initialized")

    const uri = await this.ensureDocumentOpened(filePath)

    const result = await this.sendRequest("textDocument/documentSymbol", {
      textDocument: { uri }
    })

    return result as LSPSymbol[] | null
  }

  async diagnostics(filePath: string): Promise<LSPDiagnostic[]> {
    if (!this.initialized) throw new Error("LSP client not initialized")

    const uri = await this.ensureDocumentOpened(filePath)
    return this.waitForDiagnostics(uri)
  }

  dispose(): void {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }
}

const lspClients = new Map<string, SimpleLSPClient>()

let disposeRegistered = false

function registerDisposeHook(): void {
  if (disposeRegistered) return
  disposeRegistered = true
  process.once("exit", () => {
    for (const client of lspClients.values()) {
      client.dispose()
    }
    lspClients.clear()
  })
}

async function commandExists(command: string): Promise<boolean> {
  if (command.includes("/")) {
    try {
      await fs.access(command)
      return true
    } catch {
      return false
    }
  }

  const pathEnv = process.env.PATH || ""
  const pathEntries = pathEnv.split(":")
  for (const entry of pathEntries) {
    if (!entry) continue
    const candidate = resolve(entry, command)
    try {
      await fs.access(candidate)
      return true
    } catch {
      continue
    }
  }

  return false
}

async function resolveServerCommand(lang: string): Promise<{ command: string[] | null; error?: string }> {
  const config = LANGUAGE_SERVERS[lang]
  for (const candidate of config.commandCandidates) {
    if (await commandExists(candidate[0])) {
      return { command: candidate }
    }
  }
  return {
    command: null,
    error: `No language server executable found for '${lang}'. ${config.installHint}`
  }
}

async function getLSPClient(filePath: string, baseDir: string): Promise<{ client: SimpleLSPClient | null; error?: string }> {
  const lang = findLanguageServer(filePath)
  if (!lang) return { client: null, error: "No configured language server for this file extension" }

  const cacheKey = `${lang}:${baseDir}`
  if (lspClients.has(cacheKey)) {
    return { client: lspClients.get(cacheKey)! }
  }

  const resolvedCommand = await resolveServerCommand(lang)
  if (!resolvedCommand.command) {
    return { client: null, error: resolvedCommand.error }
  }

  const client = new SimpleLSPClient(resolvedCommand.command)

  try {
    registerDisposeHook()
    await client.initialize(baseDir)
    lspClients.set(cacheKey, client)
    return { client }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return { client: null, error: `Failed to initialize LSP for '${lang}': ${detail}` }
  }
}

function formatLocation(loc: LSPLocation): string {
  const uri = loc.uri.replace("file://", "")
  return `${uri}:${loc.range.start.line + 1}:${loc.range.start.character}`
}

function formatSymbol(symbol: LSPSymbol): string {
  const kindNames: Record<number, string> = {
    1: "file", 2: "module", 3: "namespace", 4: "package", 5: "class",
    6: "method", 7: "property", 8: "field", 9: "constructor", 10: "enum",
    11: "interface", 12: "function", 13: "variable", 14: "constant", 15: "string",
    16: "number", 17: "boolean", 18: "array", 19: "object", 20: "key",
    21: "null", 22: "enumMember", 23: "struct", 24: "event", 25: "operator",
    26: "typeParameter"
  }
  return `${symbol.name} (${kindNames[symbol.kind] || "unknown"}) at ${formatLocation(symbol.location)}`
}

export const lspGotoDefinition = tool({
  description: "Jump to symbol definition. Find WHERE something is defined.",
  args: {
    filePath: tool.schema.string().describe("File containing the symbol"),
    line: tool.schema.number().min(1).describe("Line number (1-based)"),
    character: tool.schema.number().min(0).describe("Column number (0-based)")
  },
  async execute(args, context) {
    const { client, error } = await getLSPClient(args.filePath, context.directory)
    if (!client) {
      return `❌ ${error || "No language server available for this file type"}`
    }

    try {
      const result = await client.definition(args.filePath, args.line, args.character)
      
      if (!result) {
        return "❌ No definition found"
      }

      const locations = Array.isArray(result) ? result : [result]
      
      if (locations.length === 0) {
        return "❌ No definition found"
      }

      return locations.map(formatLocation).join("\n")
    } catch (e) {
      return `❌ Error: ${e instanceof Error ? e.message : String(e)}`
    }
  }
})

export const lspFindReferences = tool({
  description: "Find ALL usages/references of a symbol across the entire workspace.",
  args: {
    filePath: tool.schema.string().describe("File containing the symbol"),
    line: tool.schema.number().min(1).describe("Line number (1-based)"),
    character: tool.schema.number().min(0).describe("Column number (0-based)"),
    includeDeclaration: tool.schema.boolean().default(true).describe("Include the declaration in results")
  },
  async execute(args, context) {
    const { client, error } = await getLSPClient(args.filePath, context.directory)
    if (!client) {
      return `❌ ${error || "No language server available for this file type"}`
    }

    try {
      const result = await client.references(args.filePath, args.line, args.character, args.includeDeclaration)
      
      if (!result || result.length === 0) {
        return "❌ No references found"
      }

      return `${result.length} reference(s) found:\n\n${result.map(formatLocation).join("\n")}`
    } catch (e) {
      return `❌ Error: ${e instanceof Error ? e.message : String(e)}`
    }
  }
})

export const lspDocumentSymbols = tool({
  description: "Get symbols from file (document) - functions, classes, variables, etc.",
  args: {
    filePath: tool.schema.string().describe("File to analyze"),
    scope: tool.schema.enum(["document", "workspace"]).default("document").describe("Get symbols from this file or search workspace"),
    query: tool.schema.string().optional().describe("Search query for workspace symbol search")
  },
  async execute(args, context) {
    const { client, error } = await getLSPClient(args.filePath, context.directory)
    if (!client) {
      return `❌ ${error || "No language server available for this file type"}`
    }

    try {
      const result = await client.documentSymbols(args.filePath)
      
      if (!result || result.length === 0) {
        return "❌ No symbols found"
      }

      return `${result.length} symbol(s) found:\n\n${result.map(formatSymbol).join("\n")}`
    } catch (e) {
      return `❌ Error: ${e instanceof Error ? e.message : String(e)}`
    }
  }
})

export const lspDiagnostics = tool({
  description: "Get errors, warnings, hints from language server BEFORE running build.",
  args: {
    filePath: tool.schema.string().describe("File to check"),
    severity: tool.schema.enum(["error", "warning", "information", "hint", "all"]).default("all").describe("Filter by severity")
  },
  async execute(args, context) {
    const { client, error } = await getLSPClient(args.filePath, context.directory)
    if (!client) {
      return `❌ ${error || "No language server available for this file type"}`
    }

    try {
      const diagnostics = await client.diagnostics(args.filePath)
      
      if (diagnostics.length === 0) {
        return "✅ No diagnostics found"
      }

      const severityNames = ["error", "warning", "information", "hint"]
      const filtered = args.severity === "all" 
        ? diagnostics 
        : diagnostics.filter(d => severityNames[d.severity - 1] === args.severity)

      if (filtered.length === 0) {
        return `✅ No ${args.severity} diagnostics found`
      }

      return filtered.map(d => {
        const severity = severityNames[d.severity - 1] || "unknown"
        return `[${severity.toUpperCase()}] Line ${d.range.start.line + 1}: ${d.message}`
      }).join("\n")
    } catch (e) {
      return `❌ Error: ${e instanceof Error ? e.message : String(e)}`
    }
  }
})
