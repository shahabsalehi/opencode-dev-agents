# Changelog

## Unreleased

### Publication Readiness
- Re-licensed project to Apache-2.0 and aligned package metadata for open-source publication.
- Renamed npm package identity to `opencode-dev-agents` for unified repository/package naming.
- Removed stale docs references and added `SECURITY.md` + `CODE_OF_CONDUCT.md`.

### Benchmarking
- Restored benchmark tier strategy with explicit cheap/expensive model namespaces using `opencode-go/*` and `github-copilot/*` IDs.
- Replaced provider-specific pricing artifact with neutral `metadata/pricing-template.json` and updated benchmark docs/examples.
- Updated benchmark validation and generation scripts to accept and use the restored model namespaces.

### Governance and SDK
- Upgraded plugin alignment to `@opencode-ai/plugin@^1.2.5`.
- Added governance hooks: `config`, `permission.ask`, `chat.message`, `chat.params`, `chat.headers`, `command.execute.before`, `shell.env`, and `experimental.chat.messages.transform`.
- Added SDK governance insights for agent discovery, session diff summaries, and todo pressure.

### Architecture
- Modularized plugin composition with `create-hooks`, `create-tools`, `create-policy`, and `plugin-interface` modules.
- Added run-ledger snapshot persistence and session recovery reconciliation.

### Safety and Policy
- Added MCP governance policy with allowlist and denylist controls.
- Added governed skills registry/executor with policy and allowlist enforcement.
- Added governance report generation for session-level policy and execution metrics.

### Configuration and DX
- Added operator mode presets (`strict`, `balanced`, `research`).
- Expanded config schema coverage in `swe-sworm.schema.json`.
- Added `doctor` CLI command (`npm run doctor`).

### Testing and CI
- Increased coverage thresholds to 70 lines / 70 statements / 75 functions / 55 branches.
- Added extended tests for hooks, approval gates, stores, recovery, diff-aware utilities, MCP governance, skills, and schema.
- Added CI Node matrix (18/20/22).
- Added release hardening workflow with build/test/coverage and publish dry-run checks.
