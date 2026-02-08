---
name: code-review
description: Comprehensive code review patterns and best practices for identifying issues, ensuring quality, and maintaining code standards across multiple programming languages.
license: MIT
compatibility: opencode
metadata:
  author: SWE Swarm Team
  version: "1.0.0"
  tags: ["code-quality", "review", "best-practices", "security", "performance"]
---

## What I Do

I provide expert guidance on conducting thorough, efficient code reviews that catch bugs, security vulnerabilities, performance issues, and maintainability problems before they reach production.

## When to Use Me

- Before merging pull requests
- During pair programming sessions
- When onboarding new team members
- For security audits
- Performance reviews
- Architecture reviews
- Refactoring assessments

## Code Review Checklist

### Security 🔒

#### Authentication & Authorization
- [ ] All endpoints check authentication where required
- [ ] Role-based access control is properly implemented
- [ ] Session management is secure (httponly, secure, samesite flags)
- [ ] Token expiration is appropriate
- [ ] Password policies are enforced

#### Input Validation
- [ ] All user inputs are validated
- [ ] Type checking is performed
- [ ] Length limits are enforced
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (output encoding)
- [ ] CSRF tokens where appropriate
- [ ] File upload validation (type, size, content)

#### Data Protection
- [ ] No hardcoded secrets, API keys, or passwords
- [ ] Sensitive data is encrypted at rest
- [ ] Sensitive data is encrypted in transit (TLS)
- [ ] PII is handled according to regulations (GDPR, CCPA)
- [ ] Audit logs for sensitive operations

#### Dangerous Functions
- [ ] No `eval()` or similar code execution
- [ ] No `innerHTML` assignments
- [ ] No `document.write()`
- [ ] Safe deserialization
- [ ] No SQL string concatenation

### Correctness ✅

#### Logic
- [ ] Code does what it claims to do
- [ ] Edge cases are handled
- [ ] Boundary conditions are checked
- [ ] Null/undefined handling
- [ ] Empty collections handled
- [ ] Error paths are reachable

#### Error Handling
- [ ] Exceptions are caught appropriately
- [ ] Error messages are user-friendly but not revealing
- [ ] Failures are logged
- [ ] Resources are cleaned up in finally blocks
- [ ] No silent failures
- [ ] Graceful degradation

#### Concurrency
- [ ] Race conditions prevented
- [ ] Deadlock risks minimized
- [ ] Thread safety where needed
- [ ] Async/await used correctly
- [ ] Promises are awaited
- [ ] Locks released in all paths

#### Resource Management
- [ ] Files are closed
- [ ] Database connections released
- [ ] Memory leaks prevented
- [ ] Large objects not retained unnecessarily
- [ ] Event listeners removed
- [ ] Timeouts cleared

### Performance 🚀

#### Algorithms
- [ ] Appropriate time complexity
- [ ] No N+1 query patterns
- [ ] Efficient data structures
- [ ] Caching used appropriately
- [ ] Pagination for large datasets

#### Resource Usage
- [ ] Memory usage is reasonable
- [ ] No unnecessary object creation
- [ ] Lazy loading where beneficial
- [ ] Compression for large payloads
- [ ] Streaming for large files

#### Async Operations
- [ ] Parallel operations where independent
- [ ] Batching where appropriate
- [ ] Debouncing/throttling user input
- [ ] Timeouts on external calls
- [ ] Circuit breakers for resilience

### Maintainability 📚

#### Naming
- [ ] Clear, descriptive names
- [ ] Consistent naming conventions
- [ ] No abbreviations (unless standard)
- [ ] Boolean names imply true/false
- [ ] Function names describe action

#### Functions
- [ ] Single responsibility
- [ ] Reasonable length (< 30 lines)
- [ ] Few parameters (< 5 ideally)
- [ ] No side effects (pure where possible)
- [ ] Early returns to reduce nesting

#### Comments
- [ ] Explain why, not what
- [ ] Complex algorithms documented
- [ ] Public APIs documented
- [ ] TODOs have issue references
- [ ] No commented-out code

#### Code Organization
- [ ] Related code is grouped
- [ ] Clear module boundaries
- [ ] Dependencies minimized
- [ ] No circular dependencies
- [ ] Consistent file structure

### Testing 🧪

#### Coverage
- [ ] New code has tests
- [ ] Edge cases tested
- [ ] Error paths tested
- [ ] Happy path tested
- [ ] Tests are meaningful

#### Test Quality
- [ ] Tests are independent
- [ ] Tests are deterministic
- [ ] Fast execution
- [ ] Clear test names
- [ ] Proper assertions

#### Test Data
- [ ] Realistic test data
- [ ] Boundary values included
- [ ] No production data in tests
- [ ] Mock external dependencies

## Review Techniques

### The Checklist Method
Use the checklist above systematically. Good for thoroughness.

### The Risk-Based Method
Focus review effort based on risk:
- High risk: Security, financial calculations, user data
- Medium risk: Business logic, APIs
- Low risk: UI, documentation, configuration

### The Change-Impact Method
Trace the impact of changes:
1. What code changed?
2. What code calls the changed code?
3. What depends on that code?
4. Are there edge cases in the call chain?

### The Scenario Method
Test mentally or with code:
1. Happy path
2. Invalid input
3. Empty/null input
4. Concurrent access
5. Failure of dependencies

## Review Communication

### Giving Feedback

#### Do:
- Be specific and actionable
- Explain why it matters
- Provide code examples
- Ask questions rather than assume
- Acknowledge good code
- Suggest, don't command

#### Don't:
- Use "you" statements ("You should...")
- Nitpick trivial style issues
- Block without explanation
- Make it personal
- Ignore the author's context

### Feedback Template

```
**[File:line]** Severity: [Blocker/Warning/Suggestion]

**Issue**: [Description]

**Why it matters**: [Impact/risk]

**Suggested fix**:
```diff
- old code
+ new code
```

**Alternative**: [If applicable]
```

## Language-Specific Considerations

### JavaScript/TypeScript
- Use `===` not `==`
- Handle promise rejections
- Use const/let, not var
- Avoid callback hell (async/await)
- Proper TypeScript types
- No `any` types without reason

### Python
- Use context managers (with statement)
- No bare except clauses
- Use list comprehensions appropriately
- Follow PEP 8
- Type hints for public APIs
- Docstrings for modules/functions

### Go
- Check all error returns
- Use interfaces appropriately
- Avoid goroutine leaks
- Context for cancellation
- Efficient string building
- Proper struct tags

### Java
- Use streams appropriately
- Auto-closeable resources
- Immutable collections where possible
- Avoid reflection
- Proper exception hierarchies
- StringBuilder for concatenation

## Review Metrics

Track these to improve process:
- **Review time**: How long until first response
- **Iterations**: How many rounds of feedback
- **Defects found**: Issues caught in review
- **Post-merge bugs**: Issues missed in review
- **Review coverage**: % of code reviewed

## Anti-Patterns to Catch

### Code Smells
- **God objects**: Classes that know too much
- **Feature envy**: Method uses more of another class
- **Primitive obsession**: Using primitives instead of objects
- **Data clumps**: Groups of data always together
- **Message chains**: `a.getB().getC().doSomething()`
- **Middleman**: Class just delegates to another

### Design Issues
- **Tight coupling**: Hard to change independently
- **Leaky abstractions**: Implementation details exposed
- **Premature abstraction**: Abstraction without need
- **Speculative generality**: Code for future needs that may never come

## Automated Checks

Use tools to catch the obvious:
- Linters (ESLint, pylint, golint)
- Static analyzers (SonarQube, CodeClimate)
- Security scanners (Snyk, OWASP)
- Formatters (Prettier, Black, gofmt)

## Remember

The goal of code review is to:
1. **Improve code quality**
2. **Share knowledge**
3. **Maintain consistency**
4. **Catch bugs early**
5. **Build team cohesion**

Not to:
- Show how smart you are
- Enforce personal preferences
- Block progress unnecessarily
- Create adversarial relationships

**Review the code, not the coder.**
**Be kind, be thorough, be constructive.**