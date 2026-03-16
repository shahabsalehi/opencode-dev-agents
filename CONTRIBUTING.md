# Contributing

Thanks for contributing.

## Development setup

```bash
npm install
npm run validate
npm test
```

## Pull request standards

- keep PRs focused and small enough to review in one pass
- include tests for behavior changes
- avoid mixing refactors with bug fixes
- update docs when config, tools, or user-facing behavior changes
- use clear commit messages that explain intent

## Definition of done

- type-check passes: `npm run validate`
- tests pass: `npm test`
- no unrelated file churn in the PR
- README or docs updated when needed

## Issue and PR hygiene

To avoid backlog bloat:

- open one issue per actionable problem, not per idea thread
- use one tracking issue for multi-step initiatives
- close stale discussion-only issues quickly after decisions are documented
- prefer draft PRs only for active work; convert or close within a short window
- squash related work before merge to keep history readable

## Release flow

- merge only changes that are shippable
- keep `CHANGELOG.md` aligned with released behavior
- use milestones to batch related work instead of many tiny open PRs
