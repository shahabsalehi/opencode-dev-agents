# swe-sworm-plugin

Governance-first OpenCode plugin for safer, more predictable software engineering workflows.

## What this repository provides

- policy-enforced execution for risky coding operations
- plan-first controls for mutation workflows
- approval gates and audit evidence for human-in-the-loop governance
- bounded delegation with anti-loop protection
- verification contracts and session-level governance reporting

## Getting started

```bash
npm install
npm run build
```

For local development:

```bash
npm run validate
npm test
```

## Configuration

- schema: `swe-sworm.schema.json`
- launch guide: `docs/launch-guide.md`
- profile templates: `suggested-profiles/`

Example profile in `.opencode/swe-sworm.json`:

```json
{
  "plugin": {
    "swe-sworm": {
      "mode": "balanced",
      "planFirst": {
        "enabled": true,
        "maxPlanAgeMs": 1800000
      }
    }
  }
}
```

## Key docs

- contribution guide: `CONTRIBUTING.md`
- roadmap and feature planning: `docs/ROADMAP.md`
- release history: `CHANGELOG.md`

## Repository layout

- `src/` - runtime, governance policies, tools, and hooks
- `.opencode/` - agents, commands, and skills
- `tests/` - unit, integration, and resilience test suites
- `benchmark/` - evaluation harness and benchmark assets

## License

Business Source License 1.1 (BUSL-1.1). See `LICENSE`.
