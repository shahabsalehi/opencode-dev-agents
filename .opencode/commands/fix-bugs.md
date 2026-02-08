---
description: Automatically detect and fix bugs in the codebase using pattern matching and safe refactoring. Scans for security vulnerabilities, logic errors, and code smells, then applies fixes.
agent: bug-hunter
model: anthropic/claude-sonnet-4-20250514
subtask: false
---

Find and fix bugs automatically in the codebase.

## Usage
```
/fix-bugs [scope] [options]
```

## Arguments
- **scope**: File, directory, or pattern to analyze (default: src/)
- **severity**: Minimum severity to fix - critical, high, medium, low (default: high)
- **auto-apply**: Whether to apply fixes automatically or review first (default: false)

## Examples
```
/fix-bugs src/
/fix-bugs src/auth --severity critical
/fix-bugs src/ --auto-apply false
```

## Process

### 1. Scan for Bugs
Run bugDetector to identify issues:
```javascript
bugDetector {
  scope: "$1",
  patterns: ["security", "logic", "concurrency"],
  severity: "${2:-high}"
}
```

### 2. Prioritize Issues
Sort by:
- Severity (critical first)
- Impact (how many files affected)
- Fix complexity

### 3. Generate Fixes
For each issue:
- Analyze root cause
- Create safe fix
- Verify no behavior change

### 4. Apply Fixes
Use refactorEngine:
```javascript
refactorEngine {
  files: [affected files],
  transformation: appropriate fix,
  dryRun: !autoApply
}
```

### 5. Validate
- Run tests
- Check for regressions
- Verify fixes

## What Gets Fixed

### Security Issues
- Hardcoded secrets
- SQL injection risks
- XSS vulnerabilities
- Insecure dependencies
- Missing input validation

### Logic Errors
- Null pointer risks
- Unhandled promise rejections
- Race conditions
- Resource leaks
- Incorrect operators

### Code Smells
- Dead code
- Duplicate code
- Overly complex functions
- Missing error handling

## Safety Measures

- Always preview changes before applying
- Run tests after each fix
- Commit after each change
- Can rollback if issues

## Output

Reports:
- Issues found
- Fixes applied
- Issues remaining
- Recommendations