---
description: Generate comprehensive test coverage for code. Analyzes code to identify untested paths, creates test cases for edge cases, and produces test files with high quality and maintainability.
agent: test-writer
model: anthropic/claude-sonnet-4-20250514
subtask: false
---

Generate comprehensive tests for code with high coverage.

## Usage
```
/generate-tests [target] [coverage-target]
```

## Arguments
- **target**: File(s) or directory to generate tests for (default: src/)
- **coverage-target**: Target coverage percentage (default: 80)
- **framework**: Testing framework (jest, vitest, pytest, go-test)

## Examples
```
/generate-tests src/utils
/generate-tests src/auth.js 90
/generate-tests src/ --framework pytest
```

## Process

### 1. Analyze Code
Use codeAnalyzer to understand:
- Functions and their complexity
- Current coverage gaps
- Edge cases to cover
- High-risk areas

### 2. Generate Test Plan
Identify:
- Happy path tests
- Edge cases
- Error scenarios
- Integration points

### 3. Create Tests
Use testGenerator:
```javascript
testGenerator {
  sourceFiles: ["$1"],
  framework: "${3:-jest}",
  coverage: "branch",
  mockExternal: true
}
```

### 4. Review Generated Tests
Check for:
- Meaningful assertions
- Clear test names
- Appropriate mocking
- Edge case coverage

### 5. Validate
- Run new tests
- Check coverage meets target
- Ensure no regressions

## What Gets Tested

### Happy Paths
- Normal operation
- Typical inputs
- Expected outputs

### Edge Cases
- Empty/null inputs
- Boundary values
- Maximum/minimum values
- Special characters

### Error Cases
- Invalid inputs
- Exception handling
- Error messages
- Recovery behavior

### Async Behavior
- Promise resolution
- Promise rejection
- Concurrent operations
- Timeouts

## Test Quality

Generated tests follow:
- AAA pattern (Arrange-Act-Assert)
- Descriptive names
- Independent execution
- Fast execution
- Meaningful assertions

## Output

Reports:
- Files analyzed
- Tests generated
- Coverage achieved
- Remaining gaps
- Recommendations

## Best Practices

- Review all generated tests
- Add domain-specific edge cases
- Ensure mocks are appropriate
- Run full test suite after