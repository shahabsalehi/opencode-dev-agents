import { describe, expect, it } from "vitest"
import { DEFAULT_REDLINE_RULES, findMatchedRedline } from "../../src/policy/redlines.js"

type CorpusEntry = {
  command: string
  unsafe: boolean
  expectedRule?: string
  critical?: boolean
}

/**
 * Curated corpus of safe/unsafe commands exercising every redline rule,
 * shell-injection wrappers, MCP-like strings, mutation-tool names,
 * and known boundary cases that previously caused FP/FN.
 */
const corpus: CorpusEntry[] = [
  // ── Critical unsafe: core redline hits ────────────────────────
  { command: "git push origin main", unsafe: true, expectedRule: "git-push", critical: true },
  { command: "git push --force origin main", unsafe: true, expectedRule: "git-push", critical: true },
  { command: "git push", unsafe: true, expectedRule: "git-push", critical: true },
  { command: "git reset --hard HEAD~1", unsafe: true, expectedRule: "git-reset-hard", critical: true },
  { command: "git clean -xdf", unsafe: true, expectedRule: "git-clean-fdx", critical: true },
  { command: "git clean -fdx", unsafe: true, expectedRule: "git-clean-fdx", critical: true },
  { command: "rm -rf /tmp/build", unsafe: true, expectedRule: "rm-rf", critical: true },
  { command: "rm -fr /etc", unsafe: true, expectedRule: "rm-rf", critical: true },
  { command: "sudo systemctl restart nginx", unsafe: true, expectedRule: "sudo", critical: true },

  // ── Non-critical unsafe: permission mutations ─────────────────
  { command: "chmod -R 777 .", unsafe: true, expectedRule: "chmod-recursive" },
  { command: "chmod -R u+w src", unsafe: true, expectedRule: "chmod-recursive" },
  { command: "chown -R root:root .", unsafe: true, expectedRule: "chown-recursive" },
  { command: "chown -R dev:dev services", unsafe: true, expectedRule: "chown-recursive" },

  // ── Shell-injection / wrapper patterns ────────────────────────
  { command: 'bash -c "git reset --hard HEAD~1"', unsafe: true, expectedRule: "git-reset-hard", critical: true },
  { command: "sh -lc 'sudo rm -rf /var/tmp/app'", unsafe: true, expectedRule: "rm-rf", critical: true },
  { command: 'eval "sudo reboot"', unsafe: true, expectedRule: "sudo", critical: true },

  // ── Safe: benign shell commands ───────────────────────────────
  { command: "npm test", unsafe: false },
  { command: "npm run lint", unsafe: false },
  { command: "git status", unsafe: false },
  { command: "git pull --rebase", unsafe: false },
  { command: "git clone https://github.com/example/repo", unsafe: false },
  { command: "ls -la", unsafe: false },
  { command: "cat README.md", unsafe: false },
  { command: "python scripts/check.py", unsafe: false },

  // ── Safe: MCP-like strings (redlines must not match) ──────────
  { command: "mcp.server.github.list_issues", unsafe: false },
  { command: "mcp__filesystem__write path=src/a.ts", unsafe: false },
  { command: "mcp.server.postgres.query SELECT 1", unsafe: false },
  { command: "mcp.exec.apply_patch dry-run", unsafe: false },
  { command: "mcp.server.github.delete_repo", unsafe: false },
  { command: "mcp__exec__command ls", unsafe: false },

  // ── Safe: mutation-tool names (not shell, redlines skip) ──────
  { command: "apply_patch --check", unsafe: false },
  { command: "edit src/index.ts", unsafe: false },
  { command: "write src/index.ts", unsafe: false },

  // ── Safe: boundary cases that must NOT false-positive ─────────
  { command: "git clean -fd", unsafe: false },
  { command: "git clean -n", unsafe: false },
  { command: "git reset HEAD file.txt", unsafe: false },
  { command: "chmod 644 file.txt", unsafe: false },
  { command: "chmod 755 script.sh", unsafe: false },
  { command: "chown user:group file.txt", unsafe: false },
  { command: "chown root file.txt", unsafe: false },
  { command: "rm file.txt", unsafe: false },
  { command: "rm -f file.txt", unsafe: false },
  { command: "git push-notification-handler", unsafe: false },
]

describe("redline precision corpus", () => {
  it("classifies every corpus entry and records outcomes", () => {
    let tp = 0
    let fp = 0
    let fn = 0
    const misclassified: string[] = []

    for (const entry of corpus) {
      const match = findMatchedRedline(entry.command, DEFAULT_REDLINE_RULES)
      const predictedUnsafe = match !== null

      if (entry.unsafe && predictedUnsafe) {
        tp += 1
        if (entry.expectedRule) {
          expect(match?.id, `rule mismatch on "${entry.command}"`).toBe(entry.expectedRule)
        }
      }
      if (!entry.unsafe && predictedUnsafe) {
        fp += 1
        misclassified.push(`FP: "${entry.command}" matched ${match?.id}`)
      }
      if (entry.unsafe && !predictedUnsafe) {
        fn += 1
        misclassified.push(`FN: "${entry.command}"`)
      }
    }

    // Record outcomes for diagnostic visibility
    expect(tp).toBeGreaterThan(0)
    expect(misclassified).toEqual([])
  })

  it("meets precision >= 0.9 and recall >= 0.95", () => {
    let tp = 0
    let fp = 0
    let fn = 0

    for (const entry of corpus) {
      const match = findMatchedRedline(entry.command, DEFAULT_REDLINE_RULES)
      const predictedUnsafe = match !== null
      if (entry.unsafe && predictedUnsafe) tp += 1
      if (!entry.unsafe && predictedUnsafe) fp += 1
      if (entry.unsafe && !predictedUnsafe) fn += 1
    }

    const precision = tp / (tp + fp)
    const recall = tp / (tp + fn)

    expect(precision).toBeGreaterThanOrEqual(0.9)
    expect(recall).toBeGreaterThanOrEqual(0.95)
  })

  it("never misses critical unsafe patterns", () => {
    const criticalMisses: string[] = []

    for (const entry of corpus) {
      if (!entry.critical) continue
      const match = findMatchedRedline(entry.command, DEFAULT_REDLINE_RULES)
      if (match === null) {
        criticalMisses.push(entry.command)
      }
    }

    expect(criticalMisses).toEqual([])
  })
})
