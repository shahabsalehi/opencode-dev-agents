---
description: Perform comprehensive code review on pull requests or changes. Analyzes code quality, security, performance, and maintainability with actionable feedback and specific recommendations.
agent: code-reviewer
model: anthropic/claude-sonnet-4-20250514
subtask: false
---

Perform comprehensive code review with quality checks.

## Usage
```
/review-pr [scope] [focus]
```

## Arguments
- **scope**: PR number, branch, or file pattern (default: current changes)
- **focus**: Areas to focus on - all, security, performance, quality (default: all)
- **depth**: Review thoroughness - quick, standard, thorough (default: standard)

## Examples
```
/review-pr
/review-pr 42
/review-pr src/auth --focus security
/review-pr feature/login --depth thorough
```

## Process

### 1. Gather Changes
```bash
git diff $1 --name-only
git diff $1
```

### 2. Automated Analysis
Run tools to catch obvious issues:
```javascript
codeAnalyzer {
  target: changed files,
  metrics: ["quality", "security", "performance"]
}

bugDetector {
  scope: changed files,
  patterns: ["security", "logic"],
  severity: "medium"
}
```

### 3. Review Changed Files
For each changed file:
- Read the diff
- Understand context
- Check against standards
- Identify issues
- Suggest improvements

### 4. Checklist Review

#### Security
- [ ] No hardcoded secrets
- [ ] Input validation
- [ ] Safe output encoding
- [ ] Proper authentication
- [ ] Authorization checks

#### Quality
- [ ] Clear naming
- [ ] Reasonable function size
- [ ] Appropriate complexity
- [ ] Error handling
- [ ] Comments where needed

#### Performance
- [ ] No obvious inefficiencies
- [ ] Appropriate data structures
- [ ] No N+1 queries
- [ ] Proper caching

#### Testing
- [ ] Tests for new code
- [ ] Edge cases covered
- [ ] Tests are meaningful

### 5. Generate Report
Structure feedback by severity:

🔴 **Blockers** (must fix)
🟡 **Warnings** (should fix)
🟢 **Suggestions** (nice to have)

## Review Areas

### Security
- Authentication & authorization
- Input validation
- Output encoding
- Data protection
- Dependency vulnerabilities

### Code Quality
- Naming conventions
- Code organization
- Complexity
- Readability
- Maintainability

### Performance
- Algorithm efficiency
- Resource usage
- Database queries
- Caching
- Async operations

### Testing
- Test coverage
- Test quality
- Edge cases
- Error scenarios

## Communication

### Feedback Style
- Be specific and actionable
- Explain why it matters
- Provide code examples
- Acknowledge good practices

### Format
```
## Code Review: [PR Name]

### Summary
Overall assessment

### Automated Checks
- Quality score: X/100
- Issues found: X critical, X warnings
- Test coverage: X%

### Detailed Review

#### [File Path]
🔴 **Line 42** - [Issue description]
- Problem: [What]
- Impact: [Why it matters]
- Suggestion: [How to fix]

🟡 **Line 78** - [Issue description]
...

### Overall Recommendations
1. [Priority 1]
2. [Priority 2]
3. [Priority 3]

### Approval Status
- [ ] Approved
- [ ] Approved with changes
- [ ] Changes requested
```

## Best Practices

- Review in manageable chunks
- Focus on critical issues first
- Distinguish preference from problems
- Provide constructive feedback
- Recognize good code

## Output

Provides:
- Quality assessment
- Security analysis
- Performance review
- Specific line comments
- Actionable recommendations
- Approval status