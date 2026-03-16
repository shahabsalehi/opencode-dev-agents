import { tool } from "@opencode-ai/plugin/tool"
import { promises as fs } from "fs"
import { resolve, join, extname } from "path"
import { cwd } from "process"
import ts from "typescript"
import { analysisCache, fileContentCache, getFileCacheKey } from "../utils/cache.js"
import { wrapToolOutput } from "../validation/schema.js"
import { DEFAULTS, getConfig, resolveBoolean, resolveNumber, resolveString } from "../config.js"
import { mapWithLimit } from "../utils/concurrency.js"

/**
 * Code Analyzer Tool
 * 
 * Performs static analysis on code to identify:
 * - Complexity metrics (cyclomatic complexity, cognitive complexity)
 * - Code quality issues
 * - Security vulnerabilities
 * - Performance anti-patterns
 * - Maintainability scores
 */

interface ComplexityMetrics {
  cyclomaticComplexity: number
  cognitiveComplexity: number
  linesOfCode: number
  linesOfComments: number
  functionCount: number
  averageFunctionLength: number
}

interface QualityIssue {
  type: "security" | "performance" | "maintainability" | "style"
  severity: "low" | "medium" | "high" | "critical"
  message: string
  confidence: "high" | "medium" | "low" | "heuristic"
  evidence: string
  verification: "ast+lsp" | "ast" | "lsp" | "regex"
  ruleId: string
  line?: number
  column?: number
  rule?: string
}

type AnalysisMode = "fast" | "balanced" | "precise"

interface AnalysisResult {
  filePath: string
  metrics: ComplexityMetrics
  issues: QualityIssue[]
  maintainabilityIndex: number
  grade: "A" | "B" | "C" | "D" | "F"
  recommendations: string[]
}

// Security patterns to detect
const securityPatterns = [
  { pattern: /eval\s*\(/i, message: "Use of eval() can lead to code injection", severity: "critical" as const },
  { pattern: /document\.write\s*\(/i, message: "document.write can lead to XSS vulnerabilities", severity: "high" as const },
  { pattern: /innerHTML\s*=/i, message: "innerHTML assignment can lead to XSS", severity: "high" as const },
  { pattern: /password\s*[=:]\s*["'][^"']+["']/i, message: "Hardcoded password detected", severity: "critical" as const },
  { pattern: /api[_-]?key\s*[=:]\s*["'][^"']+["']/i, message: "Hardcoded API key detected", severity: "critical" as const },
  { pattern: /secret\s*[=:]\s*["'][^"']+["']/i, message: "Hardcoded secret detected", severity: "critical" as const },
  { pattern: /console\.log\s*\(/i, message: "Debug console statement should be removed", severity: "low" as const },
  { pattern: /debugger;/i, message: "Debugger statement should be removed", severity: "medium" as const }
]

// Performance anti-patterns
const performancePatterns = [
  { pattern: /for\s*\(\s*var\s+i\s*=\s*0;\s*i\s*<\s*(\w+)\.length/, message: "Inefficient loop - caching array length improves performance", severity: "low" as const },
  { pattern: /new\s+Array\s*\(\s*\d+\s*\)/, message: "Consider using array literal [] instead of new Array()", severity: "low" as const },
  { pattern: /\.indexOf\s*\(\s*["'][^"']+["']\s*\)\s*!==?\s*-1/, message: "Consider using includes() for readability", severity: "low" as const }
]

// Maintainability patterns
const maintainabilityPatterns = [
  { pattern: /function\s*\w*\s*\([^)]*\)\s*\{[^{}]{300,}\}/s, message: "Function too long - consider breaking into smaller functions", severity: "medium" as const },
  { pattern: /if\s*\([^)]*\)\s*\{[^}]*if\s*\(/s, message: "Deep nesting detected - consider early returns or extraction", severity: "medium" as const },
  { pattern: /TODO|FIXME|XXX|HACK/i, message: "Technical debt marker found", severity: "low" as const },
  { pattern: /var\s+/g, message: "Use let or const instead of var for better scoping", severity: "low" as const }
]

function calculateCyclomaticComplexity(content: string): number {
  const branches = [
    /\bif\b/g,
    /\belse\s+if\b/g,
    /\bswitch\b/g,
    /\bcase\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bdo\b/g,
    /\?\s*[^:]+\s*:/g, // ternary operators
    /\|\|/g,
    /&&/g,
    /\bcatch\b/g
  ]
  
  let complexity = 1 // Base complexity
  branches.forEach(pattern => {
    const matches = content.match(pattern)
    if (matches) {
      complexity += matches.length
    }
  })
  
  return complexity
}

function calculateCognitiveComplexity(content: string): number {
  const nestingPatterns = [
    { pattern: /\{[^{}]*\{/g, weight: 1 },
    { pattern: /\bif\b|\bfor\b|\bwhile\b|\bswitch\b/g, weight: 1 },
    { pattern: /\?\s*[^:]+\s*:/g, weight: 1 } // ternary
  ]
  
  let complexity = 0
  nestingPatterns.forEach(({ pattern, weight }) => {
    const matches = content.match(pattern)
    if (matches) {
      complexity += matches.length * weight
    }
  })
  
  return complexity
}

function calculateMaintainabilityIndex(
  halsteadVolume: number, 
  cyclomaticComplexity: number, 
  linesOfCode: number,
  commentRatio: number
): number {
  // Simplified maintainability index calculation
  // Range: 0-100, higher is better
  const mi = Math.max(0, 
    171 - 
    5.2 * Math.log(halsteadVolume || 1) - 
    0.23 * cyclomaticComplexity - 
    16.2 * Math.log(linesOfCode || 1) + 
    50 * Math.sin(Math.sqrt(2.46 * commentRatio))
  )
  
  return Math.min(100, Math.max(0, mi))
}

function assignGrade(maintainabilityIndex: number, complexity: number): AnalysisResult["grade"] {
  if (maintainabilityIndex >= 85 && complexity <= 10) return "A"
  if (maintainabilityIndex >= 70 && complexity <= 20) return "B"
  if (maintainabilityIndex >= 50 && complexity <= 30) return "C"
  if (maintainabilityIndex >= 25) return "D"
  return "F"
}

async function analyzeFile(filePath: string, content: string, mode: AnalysisMode, packageWarnings: Set<string>): Promise<AnalysisResult> {
  const lines = content.split('\n')
  const linesOfCode = lines.filter(line => line.trim().length > 0).length
  const linesOfComments = lines.filter(line => 
    line.trim().startsWith('//') || 
    line.trim().startsWith('*') || 
    line.trim().startsWith('/*')
  ).length
  
  const commentRatio = linesOfCode > 0 ? linesOfComments / linesOfCode : 0
  
  // Count functions
  const functionMatches = content.match(/\bfunction\s+\w+\s*\(|\basync\s+function\s*\(|\bconst\s+\w+\s*=\s*(async\s*)?\(|\b\w+\s*:\s*(async\s*)?\(/g)
  const functionCount = functionMatches ? functionMatches.length : 0
  const averageFunctionLength = functionCount > 0 ? Math.round(linesOfCode / functionCount) : 0
  
  const cyclomaticComplexity = calculateCyclomaticComplexity(content)
  const cognitiveComplexity = calculateCognitiveComplexity(content)
  
  // Detect issues
  const issues: QualityIssue[] = []
  const language = detectLanguage(filePath)
  const sourceFile = getAstSourceFile(filePath, content, language, mode, packageWarnings)
  const lspDiagnostics = mode === "precise" && sourceFile
    ? getTypeScriptDiagnostics(filePath, content)
    : []
  
  // Security issues
  securityPatterns.forEach(({ pattern, message, severity }, idx) => {
    const matches = content.match(pattern)
    if (matches) {
      matches.forEach((matchText) => {
        const verification = resolveVerificationForAnalyzer(mode, sourceFile, lspDiagnostics)
        issues.push({
          type: "security",
          severity,
          message,
          confidence: resolveConfidence(mode, verification),
          evidence: buildAnalyzerEvidence(verification, matchText, lspDiagnostics),
          verification,
          ruleId: `SEC-${(idx + 1).toString().padStart(3, "0")}`,
          rule: "security"
        })
      })
    }
  })
  
  // Performance issues
  performancePatterns.forEach(({ pattern, message, severity }, idx) => {
    const matches = content.match(pattern)
    if (matches) {
      matches.forEach((matchText) => {
        const verification = resolveVerificationForAnalyzer(mode, sourceFile, lspDiagnostics)
        issues.push({
          type: "performance",
          severity,
          message,
          confidence: resolveConfidence(mode, verification),
          evidence: buildAnalyzerEvidence(verification, matchText, lspDiagnostics),
          verification,
          ruleId: `PERF-${(idx + 1).toString().padStart(3, "0")}`,
          rule: "performance"
        })
      })
    }
  })
  
  // Maintainability issues
  maintainabilityPatterns.forEach(({ pattern, message, severity }, idx) => {
    const matches = content.match(pattern)
    if (matches) {
      matches.forEach((matchText) => {
        const verification = resolveVerificationForAnalyzer(mode, sourceFile, lspDiagnostics)
        issues.push({
          type: "maintainability",
          severity,
          message,
          confidence: resolveConfidence(mode, verification),
          evidence: buildAnalyzerEvidence(verification, matchText, lspDiagnostics),
          verification,
          ruleId: `MAIN-${(idx + 1).toString().padStart(3, "0")}`,
          rule: "maintainability"
        })
      })
    }
  })
  
  // Calculate maintainability index (simplified)
  const halsteadVolume = linesOfCode * Math.log2(functionCount + 1 || 2)
  const maintainabilityIndex = calculateMaintainabilityIndex(
    halsteadVolume,
    cyclomaticComplexity,
    linesOfCode,
    commentRatio
  )
  
  const grade = assignGrade(maintainabilityIndex, cyclomaticComplexity)
  
  // Generate recommendations
  const recommendations: string[] = []
  if (cyclomaticComplexity > 10) {
    recommendations.push("Reduce cyclomatic complexity by breaking complex functions into smaller ones")
  }
  if (cognitiveComplexity > 15) {
    recommendations.push("Simplify cognitive complexity by reducing nested conditions")
  }
  if (commentRatio < 0.1) {
    recommendations.push("Add more inline comments to improve code documentation")
  }
  if (averageFunctionLength > 30) {
    recommendations.push("Break long functions into smaller, more focused functions")
  }
  if (functionCount > 0 && functionCount < 2 && linesOfCode > 100) {
    recommendations.push("Consider modularizing the code into separate files")
  }
  
  return {
    filePath,
    metrics: {
      cyclomaticComplexity,
      cognitiveComplexity,
      linesOfCode,
      linesOfComments,
      functionCount,
      averageFunctionLength
    },
    issues,
    maintainabilityIndex: Math.round(maintainabilityIndex),
    grade,
    recommendations
  }
}

const LANGUAGE_MAP: Record<string, string> = {
  js: "javascript", ts: "typescript", jsx: "javascript", tsx: "typescript",
  py: "python", go: "go", java: "java", rb: "ruby", php: "php",
  rs: "rust", cs: "csharp", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp",
  c: "c", h: "c",
  swift: "swift", kt: "kotlin", scala: "scala",
  ex: "elixir", exs: "elixir",
  hs: "haskell", lhs: "haskell",
  lua: "lua", jl: "julia", r: "r",
  sh: "bash", bash: "bash", zsh: "zsh",
  ps1: "powershell", psd1: "powershell", psm1: "powershell",
  dart: "dart", elm: "elm", erl: "erlang", hrl: "erlang",
  fs: "fsharp", fsx: "fsharp", fsproj: "fsharp",
  ml: "ocaml", mli: "ocaml",
  nim: "nim", nims: "nim",
  cr: "crystal",
  d: "d", di: "d",
  pas: "pascal", pp: "pascal",
  ada: "ada", adb: "ada", ads: "ada",
  cob: "cobol", cbl: "cobol",
  for: "fortran", f90: "fortran", f95: "fortran",
  sol: "solidity",
  vy: "vyper",
  move: "move",
  cairo: "cairo",
  no: "number", nu: "number",
  clj: "clojure", cljs: "clojure", cljc: "clojure",
  lfe: "lisp", lisp: "lisp", cl: "lisp",
  scm: "scheme", ss: "scheme",
  rkt: "racket",
  pro: "prolog", pl: "prolog",
  groovy: "groovy", gvy: "groovy",
  tf: "terraform", tfvars: "terraform",
  rego: "rego",
  toml: "toml", yaml: "yaml", yml: "yaml",
  json: "json", jsonc: "json",
  xml: "xml", xsd: "xml", xsl: "xml",
  html: "html", htm: "html",
  css: "css", scss: "scss", sass: "sass", less: "less",
  vue: "vue", svelte: "svelte",
  graphql: "graphql", gql: "graphql",
  sql: "sql", mysql: "sql", pgsql: "sql", plsql: "sql",
  prisma: "prisma",
  proto: "protobuf",
  thrift: "thrift",
  avdl: "avro",
  wasm: "wasm", wat: "wasm",
  dockerfile: "dockerfile",
  makefile: "makefile", mk: "makefile",
  cmake: "cmake", "cmake.in": "cmake",
  ninja: "ninja",
  meson: "meson",
  gn: "gn",
  bazel: "bazel", bzl: "bazel",
  buck: "buck",
  pants: "pants",
  gradle: "gradle",
  maven: "maven", pom: "maven",
  sbt: "sbt",
  lein: "leiningen",
  rebar: "rebar", "rebar.config": "rebar",
  mix: "mix", "mix.exs": "mix",
  cargo: "cargo", "cargo.toml": "cargo", "cargo.lock": "cargo",
  stack: "stack", "stack.yaml": "stack",
  cabal: "cabal", "cabal.project": "cabal",
  opam: "opam", "opam.locked": "opam",
  dune: "dune", "dune-project": "dune",
  esy: "esy", "esy.json": "esy",
  npm: "npm", "package.json": "npm", "package-lock.json": "npm",
  yarn: "yarn", "yarn.lock": "yarn",
  pnpm: "pnpm", "pnpm-lock.yaml": "pnpm",
  bun: "bun", "bun.lockb": "bun",
  pip: "pip", "requirements.txt": "pip", "requirements.in": "pip",
  poetry: "poetry", "poetry.lock": "poetry",
  conda: "conda", "environment.yml": "conda",
  gem: "gem", "gemfile": "gem", "gemfile.lock": "gem",
  bundler: "bundler",
  composer: "composer", "composer.json": "composer", "composer.lock": "composer",
  vgo: "vgo", "go.mod": "vgo", "go.sum": "vgo",
  glide: "glide", "glide.yaml": "glide",
  dep: "dep", "gopkg.toml": "dep", "gopkg.lock": "dep",
  apm: "apm", "apm.json": "apm",
  meteor: "meteor",
  atmosphere: "atmosphere",
  packagist: "packagist",
  nuget: "nuget", "packages.config": "nuget",
  paket: "paket", "paket.dependencies": "paket",
  chocolatey: "chocolatey",
  scoop: "scoop",
  homebrew: "homebrew", "brewfile": "homebrew",
  macports: "macports",
  fink: "fink",
  pkgsrc: "pkgsrc",
  pkgin: "pkgin",
  aptitude: "aptitude",
  apt: "apt",
  dpkg: "dpkg",
  yum: "yum",
  dnf: "dnf",
  rpm: "rpm",
  pacman: "pacman",
  zypper: "zypper",
  urpmi: "urpmi",
  slackpkg: "slackpkg",
  portage: "portage",
  entropy: "entropy",
  nix: "nix", "default.nix": "nix", "shell.nix": "nix",
  guix: "guix",
  apk: "apk",
  opkg: "opkg",
  ipkg: "ipkg",
  tce: "tce",
  tcz: "tcz",
  pet: "pet",
  sfs: "sfs",
  xzm: "xzm",
  lzm: "lzm",
  sb: "sb",
  module: "module", "module.bundle": "module",
  appimage: "appimage",
  snap: "snap",
  flatpak: "flatpak",
  flathub: "flathub",
  appstore: "appstore",
  playstore: "playstore",
  fdroid: "fdroid",
  aur: "aur",
  abs: "abs",
  arch: "arch",
  manjaro: "manjaro",
  endeavouros: "endeavouros",
  arcolinux: "arcolinux",
  garuda: "garuda",
  artix: "artix",
  void: "void",
  gentoo: "gentoo",
  funtoo: "funtoo",
  sabayon: "sabayon",
  calculate: "calculate",
  redcore: "redcore",
  chromium: "chromium",
  chromeos: "chromeos",
  cloudready: "cloudready",
  fydeos: "fydeos",
  arduino: "arduino",
  platformio: "platformio",
  mbed: "mbed",
  zephyr: "zephyr",
  freertos: "freertos",
  rtos: "rtos",
  nuttx: "nuttx",
  riot: "riot",
  contiki: "contiki",
  tinyos: "tinyos",
  tos: "tos",
  nesC: "nesc",
  sensorweb: "sensorweb",
  sensortag: "sensortag",
  sensortile: "sensortile",
  openmote: "openmote",
  zolertia: "zolertia",
  firefly: "firefly",
  sky: "sky",
  telosb: "telosb",
  micaz: "micaz",
  mica2: "mica2",
  mica2dot: "mica2dot",
  eyesIFX: "eyesifx",
  cricket: "cricket",
  btnode: "btnode",
  tinynode: "tinynode",
  sunspot: "sunspot",
  shimmer: "shimmer",
  epic: "epic",
  enalab: "enalab",
  indriya: "indriya",
  twist: "twist",
  flocklab: "flocklab",
  dagu: "dagu",
  cooja: "cooja",
  mspsim: "mspsim",
  avrora: "avrora",
  tossim: "tossim",
  powertosim: "powertosim",
  atemu: "atemu",
  nctuns: "nctuns",
  gtsnets: "gtsnets",
  qualnet: "qualnet",
  opnet: "opnet",
  ns2: "ns2",
  ns3: "ns3",
  omnet: "omnet",
  jiST: "jist",
  swans: "swans",
  glomosim: "glomosim",
  parsec: "parsec",
  gtnetS: "gtnets",
  mininet: "mininet",
  maxinet: "maxinet",
  containernet: "containernet",
  fogbed: "fogbed",
  edgecloudsim: "edgecloudsim",
  pureedgeSim: "pureedgesim",
  ifogsim: "ifogsim",
  ifogsim2: "ifogsim2",
  yafs: "yafs",
  iotSim: "iotsim",
  icarus: "icarus",
  ndnsim: "ndnsim",
  ccnsim: "ccnsim",
  psirp: "psirp",
  netinf: "netinf",
  sail: "sail",
  convergence: "convergence",
  mobiccn: "mobiccn",
  cbcbsim: "cbcbsim",
  greencloud: "greencloud",
  cloudsim: "cloudsim",
  cloudnetsim: "cloudnetsim",
  workflowsim: "workflowsim",
  diskSim: "disksim",
  flashsim: "flashsim",
  ssdsim: "ssdsim",
  raidSim: "raidsim",
  memSim: "memsim",
  cacti: "cacti",
  simplescalar: "simplescalar",
  gem5: "gem5",
  marss: "marss",
  ptlsim: "ptlsim",
  sins: "sins",
  logisim: "logisim",
  digital: "digital",
  verilog: "verilog", v: "verilog",
  vhdl: "vhdl", vhd: "vhdl",
  systemverilog: "systemverilog", sv: "systemverilog",
  bluespec: "bluespec", bsv: "bluespec",
  chisel: "chisel",
  spinalhdl: "spinalhdl",
  myhdl: "myhdl",
  cocotb: "cocotb",
  pyverilog: "pyverilog",
  pyvhdl: "pyvhdl",
  hdlConvertor: "hdlconvertor",
  pyrtl: "pyrtl",
  pyMTL: "pymtl",
  migen: "migen",
  nmigen: "nmigen",
  amaranth: "amaranth",
  litex: "litex",
  silice: "silice",
  clash: "clash",
  koka: "koka",
  idris: "idris",
  agda: "agda",
  coq: "coq",
  lean: "lean",
  isabelle: "isabelle",
  hol: "hol",
  pvs: "pvs",
  acl2: "acl2",
  twelf: "twelf",
  elf: "elf",
  dafny: "dafny",
  fstar: "fstar",
  why3: "why3",
  boogie: "boogie",
  symbooglix: "symbooglix",
  corral: "corral",
  smack: "smack",
  seahorn: "seahorn",
  infer: "infer",
  cbmc: "cbmc",
  esbmc: "esbmc",
  jbmc: "jbmc",
  llbmc: "llbmc",
  smt: "smt",
  smtlib: "smtlib",
  z3: "z3",
  cvc4: "cvc4",
  cvc5: "cvc5",
  yices: "yices",
  boolector: "boolector",
  mathsat: "mathsat",
  verit: "verit",
  altergo: "altergo",
  vampire: "vampire",
  e: "e",
  spass: "spass",
  princess: "princess",
  opensmt: "opensmt",
  stp: "stp",
  minisat: "minisat",
  picosat: "picosat",
  glucose: "glucose",
  cadical: "cadical",
  kissat: "kissat",
  lingeling: "lingeling",
  treengeling: "treengeling",
  plingeling: "plingeling",
  cms: "cms",
  cryptominisat: "cryptominisat",
  riss: "riss",
  splatz: "splatz",
  maple: "maple",
  mapleCOMSPS: "maplecomsps",
  mapleCHOROB: "maplechorob",
  mapleLCMDIST: "maplelcmdist",
  mapleLRB: "maplelrb",
  mapleCOMSPSLRB: "maplecomspslrb",
  mapleCHOROBLRB: "maplechoroblrb",
  mapleLCMDISTLRB: "maplelcmdistlrb",
  mapleLRBLRB: "maplelrblrb"
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || ""
  return LANGUAGE_MAP[ext] || "unknown"
}

function getAstSourceFile(
  filePath: string,
  content: string,
  language: string,
  mode: AnalysisMode,
  packageWarnings: Set<string>
): ts.SourceFile | null {
  if (mode === "fast") return null
  if (!["javascript", "typescript"].includes(language)) {
    maybeWarnMissingLanguageSupport(language, packageWarnings)
    return null
  }
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)
}

function maybeWarnMissingLanguageSupport(language: string, packageWarnings: Set<string>): void {
  if (["unknown", "javascript", "typescript"].includes(language)) return
  packageWarnings.add(`AST/LSP precision unavailable for '${language}'. Install matching language parser package to avoid heuristic-only confidence.`)
}

function getTypeScriptDiagnostics(filePath: string, content: string): Array<{ line: number; message: string }> {
  try {
    const options: ts.CompilerOptions = {
      allowJs: true,
      checkJs: true,
      noEmit: true,
      skipLibCheck: true,
      strict: false,
      target: ts.ScriptTarget.ES2020,
      moduleResolution: ts.ModuleResolutionKind.NodeJs
    }
    const host = ts.createCompilerHost(options, true)
    const baseReadFile = host.readFile.bind(host)
    const baseFileExists = host.fileExists.bind(host)

    host.readFile = (name) => (resolve(name) === resolve(filePath) ? content : baseReadFile(name))
    host.fileExists = (name) => (resolve(name) === resolve(filePath) ? true : baseFileExists(name))

    const program = ts.createProgram([filePath], options, host)
    const source = program.getSourceFile(filePath)
    if (!source) return []

    return ts.getPreEmitDiagnostics(program, source)
      .filter((diag) => typeof diag.start === "number")
      .slice(0, 10)
      .map((diag) => {
        const position = source.getLineAndCharacterOfPosition(diag.start ?? 0)
        return { line: position.line + 1, message: ts.flattenDiagnosticMessageText(diag.messageText, " ") }
      })
  } catch {
    return []
  }
}

function resolveVerificationForAnalyzer(
  mode: AnalysisMode,
  sourceFile: ts.SourceFile | null,
  diagnostics: Array<{ line: number; message: string }>
): QualityIssue["verification"] {
  if (mode === "fast") return "regex"
  if (sourceFile && diagnostics.length > 0) return "ast+lsp"
  if (sourceFile) return "ast"
  if (diagnostics.length > 0) return "lsp"
  return "regex"
}

function resolveConfidence(mode: AnalysisMode, verification: QualityIssue["verification"]): QualityIssue["confidence"] {
  if (mode === "fast") return "heuristic"
  if (verification === "ast+lsp") return "high"
  if (verification === "ast") return mode === "precise" ? "medium" : "high"
  if (verification === "lsp") return "medium"
  return mode === "precise" ? "low" : "heuristic"
}

function buildAnalyzerEvidence(
  verification: QualityIssue["verification"],
  matchText: string,
  diagnostics: Array<{ line: number; message: string }>
): string {
  const normalized = matchText.trim().slice(0, 100)
  if (verification === "ast+lsp" && diagnostics.length > 0) {
    return `AST/LSP verified match '${normalized}'. LSP: ${diagnostics[0].message.slice(0, 140)}`
  }
  if (verification === "ast") {
    return `AST verified match '${normalized}'.`
  }
  if (verification === "lsp" && diagnostics.length > 0) {
    return `LSP diagnostic evidence: ${diagnostics[0].message.slice(0, 180)}`
  }
  return `Regex heuristic match '${normalized}'.`
}

export const codeAnalyzer = tool({
  description: "Analyzes code for complexity, quality, security, and performance issues. Returns metrics, detected issues, and recommendations.",
  args: {
    target: tool.schema.string().describe("File or directory path to analyze"),
    mode: tool.schema.enum(["fast", "balanced", "precise"]).default("precise").describe("Analysis mode: fast (regex), balanced (regex+AST), precise (regex+AST+LSP)"),
    threshold: tool.schema.number().min(0).max(100).default(70).describe("Quality threshold (0-100). Files below this score are flagged"),
    maxFiles: tool.schema.number().min(1).max(100).default(50).describe("Maximum number of files to analyze (for directories)"),
    diffOnly: tool.schema.boolean().default(false).describe("Analyze only files changed since last run")
  },
  async execute(args, context) {
    const config = getConfig().tools?.codeAnalyzer
    const resolvedThreshold = resolveNumber(
      args.threshold,
      config?.threshold,
      DEFAULTS.tools.codeAnalyzer.threshold
    )
    const resolvedMaxFiles = resolveNumber(
      args.maxFiles,
      config?.maxFiles,
      DEFAULTS.tools.codeAnalyzer.maxFiles
    )
    const resolvedDiffOnly = resolveBoolean(
      args.diffOnly,
      config?.diffOnly,
      DEFAULTS.tools.codeAnalyzer.diffOnly
    )
    const resolvedMode = resolveString(
      args.mode,
      config?.mode,
      DEFAULTS.tools.codeAnalyzer.mode
    ) as AnalysisMode
    const { target } = args
    const mode = resolvedMode
    const baseDir = context.directory || cwd()
    context.metadata({ title: "Code Analyzer" })
    
    try {
      const targetPath = resolve(baseDir, target)
      
      const results: AnalysisResult[] = []
      const packageWarnings = new Set<string>()
      let filesAnalyzed = 0
      
      const analyzeTarget = async (filePath: string) => {
        try {
          const stats = await fs.stat(filePath)
          const cacheKey = getFileCacheKey(filePath, stats.mtimeMs, "analysis")
          const cachedResult = analysisCache.get(cacheKey)?.value as AnalysisResult | undefined
          if (cachedResult && resolvedDiffOnly) {
            return
          }

          const contentKey = getFileCacheKey(filePath, stats.mtimeMs, "content")
          const cachedContent = fileContentCache.get(contentKey)?.value
          const content = cachedContent ?? await fs.readFile(filePath, 'utf-8')
          if (!cachedContent) {
            fileContentCache.set(contentKey, { value: content, mtimeMs: stats.mtimeMs })
          }

          const result = cachedResult ?? await analyzeFile(filePath, content, mode, packageWarnings)
          if (!cachedResult) {
            analysisCache.set(cacheKey, { value: result, mtimeMs: stats.mtimeMs })
          }
          results.push(result)
          filesAnalyzed++
        } catch (error) {
          console.warn(`Could not analyze ${filePath}: ${error}`)
        }
      }
      
      const stat = await fs.stat(targetPath)
      
      if (stat.isFile()) {
        await analyzeTarget(targetPath)
      } else if (stat.isDirectory()) {
        // Read directory recursively
        const readDir = async (dir: string) => {
          if (filesAnalyzed >= resolvedMaxFiles) return
          
          const entries = await fs.readdir(dir, { withFileTypes: true })
          
          const tasks = entries
            .filter(() => filesAnalyzed < resolvedMaxFiles)
            .map((entry) => async () => {
              if (filesAnalyzed >= resolvedMaxFiles) return

              const fullPath = join(dir, entry.name)

              if (entry.isDirectory()) {
                if (!['node_modules', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) {
                  await readDir(fullPath)
                }
                return
              }

              if (entry.isFile()) {
                const ext = extname(entry.name).toLowerCase()
                const supportedExts = [
                  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.mts', '.cts',
                  '.py', '.pyw', '.pyi',
                  '.go',
                  '.java', '.class', '.jar',
                  '.rb', '.rbw', '.rake', '.gemspec',
                  '.php', '.phtml', '.php3', '.php4', '.php5', '.phps',
                  '.rs', '.rlib',
                  '.c', '.h',
                  '.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx',
                  '.cs', '.csx',
                  '.swift',
                  '.kt', '.kts',
                  '.scala', '.sc',
                  '.ex', '.exs',
                  '.hs', '.lhs',
                  '.lua',
                  '.jl',
                  '.r', '.rmd', '.rnw', '.rhtml', '.rpres',
                  '.sh', '.bash', '.zsh', '.fish',
                  '.ps1', '.psm1', '.psd1',
                  '.dart',
                  '.elm',
                  '.erl', '.hrl',
                  '.fs', '.fsx', '.fsi',
                  '.ml', '.mli',
                  '.nim', '.nims',
                  '.cr',
                  '.d', '.di',
                  '.pas', '.pp',
                  '.ada', '.adb', '.ads',
                  '.cob', '.cbl',
                  '.for', '.f90', '.f95', '.f03', '.f08',
                  '.sol', '.vy',
                  '.move',
                  '.cairo',
                  '.clj', '.cljs', '.cljc', '.edn',
                  '.lisp', '.lsp', '.l', '.cl',
                  '.scm', '.ss',
                  '.rkt',
                  '.pro', '.pl',
                  '.groovy', '.gvy', '.gy', '.gsh',
                  '.tf', '.tfvars', '.hcl',
                  '.rego',
                  '.toml',
                  '.yaml', '.yml',
                  '.json', '.jsonc',
                  '.xml', '.xsd', '.xsl', '.xslt', '.wsdl',
                  '.html', '.htm', '.xhtml',
                  '.css', '.scss', '.sass', '.less',
                  '.vue', '.svelte',
                  '.graphql', '.gql',
                  '.sql', '.mysql', '.pgsql', '.plsql', '.tsql',
                  '.prisma',
                  '.proto',
                  '.thrift',
                  '.avdl',
                  '.wasm', '.wat',
                  '.dockerfile',
                  '.makefile', '.mk', '.make',
                  '.cmake', '.cmake.in',
                  '.ninja',
                  '.meson',
                  '.gn', '.gni',
                  '.bazel', '.bzl', '.BUILD', '.WORKSPACE',
                  '.buck',
                  '.pants',
                  '.gradle', '.gradle.kts',
                  '.sbt',
                  '.lein', '.project.clj',
                  '.rebar', '.rebar.config',
                  '.mix', '.mix.exs',
                  '.cargo', '.cargo.toml', '.cargo.lock',
                  '.stack', '.stack.yaml', '.stack.yaml.lock',
                  '.cabal', '.cabal.project', '.cabal.project.freeze',
                  '.opam', '.opam.locked',
                  '.dune', '.dune-project', '.dune-workspace',
                  '.esy', '.esy.json', '.esy.lock',
                  '.npm', '.package.json', '.package-lock.json', '.npmrc',
                  '.yarn', '.yarn.lock', '.yarnrc', '.yarnrc.yml',
                  '.pnpm', '.pnpm-lock.yaml', '.pnpmfile.cjs',
                  '.bun', '.bun.lockb',
                  '.pip', '.requirements.txt', '.requirements.in', '.constraints.txt',
                  '.poetry', '.poetry.lock', '.pyproject.toml',
                  '.conda', '.environment.yml', '.environment.yaml',
                  '.gem', '.Gemfile', '.Gemfile.lock',
                  '.bundler',
                  '.composer', '.composer.json', '.composer.lock',
                  '.vgo', '.go.mod', '.go.sum',
                  '.mod', '.go.mod',
                  '.glide', '.glide.yaml', '.glide.lock',
                  '.dep', '.Gopkg.toml', '.Gopkg.lock',
                  '.apm', '.apm.json',
                  '.meteor',
                  '.atmosphere',
                  '.packagist',
                  '.nuget', '.packages.config', '.packages.lock.json',
                  '.paket', '.paket.dependencies', '.paket.lock',
                  '.chocolatey',
                  '.scoop',
                  '.homebrew', '.Brewfile',
                  '.macports',
                  '.fink',
                  '.pkgsrc',
                  '.pkgin',
                  '.aptitude',
                  '.apt',
                  '.dpkg',
                  '.yum',
                  '.dnf',
                  '.rpm',
                  '.pacman',
                  '.zypper',
                  '.urpmi',
                  '.slackpkg',
                  '.portage',
                  '.entropy',
                  '.nix', '.default.nix', '.shell.nix', '.nixpkgs',
                  '.guix',
                  '.apk',
                  '.opkg',
                  '.ipkg',
                  '.tce', '.tcz',
                  '.pet',
                  '.sfs',
                  '.xzm',
                  '.lzm',
                  '.sb',
                  '.module', '.module.bundle',
                  '.appimage',
                  '.snap',
                  '.flatpak', '.flatpakref', '.flatpakrepo',
                  '.flathub',
                  '.appstore',
                  '.playstore',
                  '.fdroid',
                  '.aur', '.PKGBUILD', '.SRCINFO',
                  '.abs', '.ABS',
                  '.arch',
                  '.manjaro',
                  '.endeavouros',
                  '.arcolinux',
                  '.garuda',
                  '.artix',
                  '.void',
                  '.gentoo', '.ebuild', '.eclass',
                  '.funtoo',
                  '.sabayon',
                  '.calculate',
                  '.redcore',
                  '.chromium',
                  '.chromeos',
                  '.cloudready',
                  '.fydeos',
                  '.arduino', '.ino', '.pde',
                  '.platformio', '.platformio.ini',
                  '.mbed', '.mbed_app.json', '.mbed_settings.py',
                  '.zephyr', '.zephyrproject', '.west.yml',
                  '.freertos',
                  '.rtos',
                  '.nuttx',
                  '.riot',
                  '.contiki',
                  '.tinyos', '.tos',
                  '.nesC', '.nc',
                  '.sensorweb',
                  '.sensortag',
                  '.sensortile',
                  '.openmote',
                  '.zolertia',
                  '.firefly',
                  '.sky',
                  '.telosb',
                  '.micaz',
                  '.mica2',
                  '.mica2dot',
                  '.eyesIFX',
                  '.cricket',
                  '.btnode',
                  '.tinynode',
                  '.sunspot',
                  '.shimmer',
                  '.epic',
                  '.enalab',
                  '.indriya',
                  '.twist',
                  '.flocklab',
                  '.dagu',
                  '.cooja',
                  '.mspsim',
                  '.avrora',
                  '.tossim',
                  '.powertosim',
                  '.atemu',
                  '.nctuns',
                  '.gtsnets',
                  '.qualnet',
                  '.opnet',
                  '.ns2', '.tcl',
                  '.ns3', '.cc', '.h',
                  '.omnet', '.ned', '.msg',
                  '.jiST', '.jist',
                  '.swans',
                  '.glomosim',
                  '.parsec', '.pde',
                  '.gtnetS',
                  '.mininet', '.mn',
                  '.maxinet',
                  '.containernet',
                  '.fogbed',
                  '.edgecloudsim',
                  '.pureedgeSim',
                  '.ifogsim',
                  '.ifogsim2',
                  '.yafs',
                  '.iotSim',
                  '.icarus', '.ini',
                  '.ndnsim',
                  '.ccnsim',
                  '.psirp',
                  '.netinf',
                  '.sail',
                  '.convergence',
                  '.mobiccn',
                  '.cbcbsim',
                  '.greencloud',
                  '.cloudsim',
                  '.cloudnetsim',
                  '.workflowsim',
                  '.diskSim', '.parv',
                  '.flashsim',
                  '.ssdsim',
                  '.raidSim',
                  '.memSim',
                  '.cacti',
                  '.simplescalar',
                  '.gem5', '.py', '.cc', '.hh',
                  '.marss',
                  '.ptlsim',
                  '.sins',
                  '.logisim', '.circ',
                  '.digital',
                  '.verilog', '.v', '.vh', '.sv', '.svh',
                  '.vhdl', '.vhd', '.vhdl',
                  '.systemverilog', '.sv', '.svh',
                  '.bluespec', '.bsv',
                  '.chisel', '.scala',
                  '.spinalhdl', '.scala',
                  '.myhdl', '.py',
                  '.cocotb', '.py',
                  '.pyverilog', '.py',
                  '.pyvhdl', '.py',
                  '.hdlConvertor', '.py',
                  '.pyrtl', '.py',
                  '.pyMTL', '.py',
                  '.migen', '.py',
                  '.nmigen', '.py',
                  '.amaranth', '.py',
                  '.litex', '.py',
                  '.silice', '.sil',
                  '.clash', '.hs',
                  '.koka', '.kk',
                  '.idris', '.idr', '.ipkg',
                  '.agda', '.agda', '.lagda',
                  '.coq', '.v', '.vo', '.glob',
                  '.lean', '.lean', '.olean',
                  '.isabelle', '.thy',
                  '.hol', '.sml', '.sig',
                  '.pvs', '.pvs', '.prf',
                  '.acl2', '.lisp',
                  '.twelf', '.elf', '.cfg',
                  '.dafny', '.dfy',
                  '.fstar', '.fst', '.fsti',
                  '.why3', '.why', '.mlw',
                  '.boogie', '.bpl',
                  '.symbooglix',
                  '.corral', '.bpl',
                  '.smack', '.bpl',
                  '.seahorn', '.bc', '.smt2',
                  '.infer', '.json',
                  '.cbmc', '.c', '.i', '.gb',
                  '.esbmc', '.c', '.cpp', '.i',
                  '.jbmc', '.java', '.class',
                  '.llbmc', '.bc', '.ll',
                  '.smt', '.smt2', '.smt',
                  '.smtlib', '.smt2',
                  '.z3', '.smt2',
                  '.cvc4', '.smt2',
                  '.cvc5', '.smt2',
                  '.yices', '.smt2', '.ys',
                  '.boolector', '.smt2',
                  '.mathsat', '.smt2',
                  '.verit', '.smt2',
                  '.altergo', '.smt2', '.why',
                  '.vampire', '.tptp', '.fof',
                  '.e', '.tptp',
                  '.spass', '.tptp',
                  '.princess', '.smt2',
                  '.opensmt', '.smt2',
                  '.stp', '.smt2', '.cvc',
                  '.minisat', '.cnf', '.dimacs',
                  '.picosat', '.cnf',
                  '.glucose', '.cnf',
                  '.cadical', '.cnf',
                  '.kissat', '.cnf',
                  '.lingeling', '.cnf',
                  '.treengeling', '.cnf',
                  '.plingeling', '.cnf',
                  '.cms', '.cnf',
                  '.cryptominisat', '.cnf',
                  '.riss', '.cnf',
                  '.splatz', '.cnf',
                  '.maple', '.cnf',
                  '.mapleCOMSPS', '.cnf',
                  '.mapleCHOROB', '.cnf',
                  '.mapleLCMDIST', '.cnf',
                  '.mapleLRB', '.cnf',
                  '.mapleCOMSPSLRB', '.cnf',
                  '.mapleCHOROBLRB', '.cnf',
                  '.mapleLCMDISTLRB', '.cnf',
                  '.mapleLRBLRB', '.cnf'
                ]
                if (supportedExts.includes(ext)) {
                  await analyzeTarget(fullPath)
                }
              }
            })

          await mapWithLimit(tasks, 8, (task) => task())
        }
        
        await readDir(targetPath)
      }
      
      // Calculate summary statistics
      const summary = {
        totalFiles: results.length,
        mode,
        averageComplexity: results.length > 0 
          ? Math.round(results.reduce((sum, r) => sum + r.metrics.cyclomaticComplexity, 0) / results.length)
          : 0,
        totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0),
        securityIssues: results.reduce((sum, r) => sum + r.issues.filter(i => i.type === "security").length, 0),
        performanceIssues: results.reduce((sum, r) => sum + r.issues.filter(i => i.type === "performance").length, 0),
        maintainabilityIssues: results.reduce((sum, r) => sum + r.issues.filter(i => i.type === "maintainability").length, 0),
        averageMaintainability: results.length > 0
          ? Math.round(results.reduce((sum, r) => sum + r.maintainabilityIndex, 0) / results.length)
          : 0,
        confidenceBreakdown: {
          high: results.reduce((sum, r) => sum + r.issues.filter((i) => i.confidence === "high").length, 0),
          medium: results.reduce((sum, r) => sum + r.issues.filter((i) => i.confidence === "medium").length, 0),
          low: results.reduce((sum, r) => sum + r.issues.filter((i) => i.confidence === "low").length, 0),
          heuristic: results.reduce((sum, r) => sum + r.issues.filter((i) => i.confidence === "heuristic").length, 0)
        },
        packageWarnings: Array.from(packageWarnings),
        belowThreshold: results.filter(r => r.maintainabilityIndex < resolvedThreshold).length,
        gradeDistribution: {
          A: results.filter(r => r.grade === "A").length,
          B: results.filter(r => r.grade === "B").length,
          C: results.filter(r => r.grade === "C").length,
          D: results.filter(r => r.grade === "D").length,
          F: results.filter(r => r.grade === "F").length
        }
      }
      
      // Build output string
      let output = `## Code Analysis Report\n\n`
      output += `### Summary\n`
      output += `- **Mode:** ${summary.mode} (${resolvedDiffOnly ? "Diff-only" : "Full"})\n`
      output += `- **Files Analyzed:** ${summary.totalFiles}\n`
      output += `- **Average Complexity:** ${summary.averageComplexity}\n`
      output += `- **Average Maintainability:** ${summary.averageMaintainability}/100\n`
      output += `- **Total Issues:** ${summary.totalIssues}\n`
      output += `- **Confidence:** high=${summary.confidenceBreakdown.high}, medium=${summary.confidenceBreakdown.medium}, low=${summary.confidenceBreakdown.low}, heuristic=${summary.confidenceBreakdown.heuristic}\n`
      output += `  - Security: ${summary.securityIssues}\n`
      output += `  - Performance: ${summary.performanceIssues}\n`
      output += `  - Maintainability: ${summary.maintainabilityIssues}\n`
      output += `- **Below Threshold:** ${summary.belowThreshold} files\n`
      output += `- **Grade Distribution:** A:${summary.gradeDistribution.A} B:${summary.gradeDistribution.B} C:${summary.gradeDistribution.C} D:${summary.gradeDistribution.D} F:${summary.gradeDistribution.F}\n\n`
      
      if (summary.packageWarnings.length > 0) {
        output += `\n### ⚠️ Precision Warnings\n`
        for (const warning of summary.packageWarnings) {
          output += `- ${warning}\n`
        }
        output += `\n`
      }

      if (results.length === 0) {
        output += `### No files found to analyze\n`
      } else {
        output += `### File Details (sorted by maintainability)\n\n`
        
        const sortedResults = results.sort((a, b) => a.maintainabilityIndex - b.maintainabilityIndex)
        
        for (const result of sortedResults) {
          const relativePath = result.filePath.replace(baseDir, '').replace(/^\//, '')
          const status = result.maintainabilityIndex < resolvedThreshold ? '⚠️' : '✅'
          
          output += `${status} **${relativePath}**\n`
          output += `   Grade: ${result.grade} | Maintainability: ${result.maintainabilityIndex}/100\n`
          output += `   Complexity: ${result.metrics.cyclomaticComplexity} | Functions: ${result.metrics.functionCount} | LOC: ${result.metrics.linesOfCode}\n`
          
          if (result.issues.length > 0) {
            output += `   Issues: ${result.issues.length}\n`
            for (const issue of result.issues.slice(0, 3)) {
              const emoji = issue.severity === 'critical' ? '🚨' : issue.severity === 'high' ? '⚠️' : '💡'
              output += `   ${emoji} ${issue.message} [${issue.confidence}/${issue.verification}]\n`
            }
            if (result.issues.length > 3) {
              output += `   ... and ${result.issues.length - 3} more\n`
            }
          }
          
          output += `\n`
        }
      }
      
      context.metadata({
        title: "Code Analyzer",
        metadata: {
          filesAnalyzed: summary.totalFiles,
          totalIssues: summary.totalIssues,
          belowThreshold: summary.belowThreshold
        }
      })
      return wrapToolOutput({
        summary,
        details: output,
        metadata: {
          tool: "codeAnalyzer",
          filesAnalyzed: summary.totalFiles,
          issues: summary.totalIssues,
          mode
        }
      })
    } catch (error) {
      throw new Error(`Code analysis failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
})
