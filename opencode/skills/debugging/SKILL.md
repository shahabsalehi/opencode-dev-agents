---
name: debugging
description: Systematic debugging methodologies and techniques for finding root causes, analyzing failures, and resolving complex software issues efficiently across different languages and environments.
license: MIT
compatibility: opencode
metadata:
  author: SWE Swarm Team
  version: "1.0.0"
  tags: ["debugging", "troubleshooting", "root-cause-analysis", "problem-solving"]
---

## What I Do

I provide systematic approaches to debugging software issues, from simple syntax errors to complex race conditions and memory leaks. I help you find root causes efficiently and prevent similar issues in the future.

## When to Use Me

- Production incidents
- Intermittent failures
- Performance regressions
- Memory leaks
- Race conditions
- Test failures
- Integration issues
- Environment-specific bugs

## The Debugging Process

### Phase 1: Understand the Problem

Before touching code, gather information:

**Ask the 5 W's:**
- **What**: What is the symptom?
- **When**: When does it occur? (frequency, timing)
- **Where**: Where in the code? Which environment?
- **Who**: Who is affected? Which users/features?
- **Why**: Why is this a problem? What's the impact?

**Gather Evidence:**
- Error messages and stack traces
- Logs (application, system, access)
- Recent changes (commits, deployments)
- Environment details (versions, config)
- User reports and reproduction steps

**Check the Basics:**
- Is the code even running? (deployment issues)
- Are dependencies correct? (version mismatches)
- Is configuration correct? (env vars, secrets)
- Is the database reachable? (network issues)

### Phase 2: Reproduce

**If you can't reproduce it, you can't fix it.**

Steps to reproduce:
1. Create minimal test case
2. Document exact steps
3. Note environment details
4. Verify consistency

**Minimal Reproduction:**
```
Remove everything that doesn't contribute to the bug:
- Simplify input data
- Remove unrelated code
- Use fresh environment
- Disable features one by one
```

### Phase 3: Form Hypotheses

**Generate Potential Causes:**

Common bug categories:

#### Logic Errors
- Off-by-one errors
- Incorrect operators (< vs <=)
- Wrong variable used
- Boolean logic mistakes
- Missing cases in switch/if-else

#### State Issues
- Uninitialized variables
- Stale cache data
- Race conditions
- Improper state transitions
- Side effects in unexpected places

#### Resource Issues
- Memory leaks
- File handle exhaustion
- Connection pool depletion
- Disk space issues
- Thread starvation

#### Data Issues
- Null/undefined values
- Type mismatches
- Encoding problems
- Serialization errors
- Data corruption

#### Environment Issues
- Configuration errors
- Missing dependencies
- Version incompatibilities
- Platform differences
- Timing issues

**Prioritize Hypotheses:**
1. What's most likely given the symptoms?
2. What's easiest to test first?
3. What's changed recently?

### Phase 4: Test Hypotheses

**Binary Search Method:**
```
If bug is somewhere in code:
1. Check midpoint
2. Is bug before or after?
3. Repeat with half that has bug
4. Continue until found
```

**Techniques:**

#### Logging
```javascript
// Add strategic logging
console.log('Point A: userId =', userId);
console.log('Point B: data =', JSON.stringify(data));
console.time('operation');
// ... code ...
console.timeEnd('operation');
```

#### Debugger
```javascript
// Set breakpoints
// Inspect variables
// Step through code
// Watch expressions
```

#### Print Debugging
```python
# Classic but effective
print(f"DEBUG: value = {value}")
print(f"DEBUG: type = {type(value)}")
print(f"DEBUG: traceback:")
import traceback
traceback.print_stack()
```

#### Assertions
```javascript
// Fail fast
console.assert(user !== null, 'User should not be null');
console.assert(response.status === 200, `Expected 200, got ${response.status}`);
```

#### Rubber Ducking
Explain the code line by line to:
- A rubber duck
- A colleague
- Yourself out loud
- This AI assistant

The act of explaining often reveals the issue.

### Phase 5: Fix and Verify

**Implement the Fix:**
- Make minimal, surgical change
- Address root cause, not symptom
- Consider edge cases
- Add regression test

**Verify Thoroughly:**
1. Does the bug reproduce case now pass?
2. Do existing tests still pass?
3. Are there similar bugs elsewhere?
4. Does fix handle edge cases?

**Document:**
- Root cause
- The fix
- Why it works
- How to prevent recurrence

## Debugging Strategies

### Strategy 1: Change One Thing at a Time
Don't change multiple variables. If you do:
- You won't know what fixed it
- You might mask the real issue
- You can't reproduce the fix

### Strategy 2: Work Backwards from Error
```
Error occurred here
↑ Called from here
↑ Called from here
↑ Called from here
↑ Data came from here
```

### Strategy 3: Compare Working vs Broken
```bash
# Git bisect to find breaking commit
git bisect start
git bisect bad HEAD
git bisect good v1.0.0
git bisect run ./test.sh
```

### Strategy 4: Simplify
```
Remove code until bug disappears
Last thing removed was related to bug
```

### Strategy 5: Assume Nothing
Verify your assumptions:
- "This variable is set" → Check it
- "This function works" → Test it
- "This data is valid" → Validate it

## Stack Trace Analysis

### Reading Stack Traces
```
Error: Cannot read property 'name' of undefined
    at getUserName (src/users.js:42:15)      ← Error occurred here
    at renderProfile (src/profile.js:23:10)  ← Called from here
    at ProfileComponent (src/components/Profile.tsx:45:5) ← Entry point
```

**Key Information:**
- **Error message**: What went wrong
- **Top frame**: Where error occurred
- **Line numbers**: Exact locations
- **Call chain**: How you got there

**Questions to Ask:**
- Is error in application or library code?
- What was the call sequence?
- What data was passed through?
- What state existed at each level?

### Common Stack Trace Patterns

#### Null Reference
```
TypeError: Cannot read property 'X' of null/undefined
→ Check if object exists before accessing property
→ Use optional chaining: obj?.property
→ Add null checks
```

#### Async Errors
```
UnhandledPromiseRejectionWarning
→ Add try/catch or .catch()
→ Ensure all promises are awaited
→ Check for floating promises
```

#### Type Errors
```
TypeError: X is not a function
→ Check that variable is what you expect
→ Verify imports/exports
→ Check for name conflicts
```

## Race Condition Debugging

### Symptoms
- Intermittent failures
- Works in debugger, fails in production
- Different results on each run
- Timing-dependent behavior

### Detection Techniques

#### Add Artificial Delays
```javascript
// Expose race conditions
await new Promise(r => setTimeout(r, Math.random() * 1000));
```

#### Log Execution Order
```javascript
const order = [];
async function operation1() {
  order.push('start:1');
  await something();
  order.push('end:1');
}
async function operation2() {
  order.push('start:2');
  await something();
  order.push('end:2');
}
// Check: order should be ['start:1', 'end:1', 'start:2', 'end:2']
// If mixed: ['start:1', 'start:2', 'end:1', 'end:2'] = race condition
```

#### Stress Testing
```javascript
// Run many times concurrently
const promises = [];
for (let i = 0; i < 1000; i++) {
  promises.push(operation());
}
await Promise.all(promises);
```

## Memory Leak Debugging

### Detection

#### Monitor Memory
```javascript
// Node.js
setInterval(() => {
  const used = process.memoryUsage();
  console.log(`Heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
}, 5000);
```

#### Heap Snapshots
```javascript
// Chrome DevTools
// 1. Take heap snapshot
// 2. Perform operation
// 3. Take another snapshot
// 4. Compare
```

### Common Causes

#### Event Listeners
```javascript
// Bad: Listener never removed
class Component {
  constructor() {
    window.addEventListener('resize', this.handleResize);
  }
}

// Good: Remove on cleanup
class Component {
  destroy() {
    window.removeEventListener('resize', this.handleResize);
  }
}
```

#### Closures
```javascript
// Bad: Captures large object
setInterval(() => {
  console.log(largeData); // Keeps largeData in memory
}, 1000);

// Good: Capture only what's needed
const needed = largeData.needed;
setInterval(() => {
  console.log(needed);
}, 1000);
```

#### Global Caches
```javascript
// Bad: Unlimited growth
const cache = new Map();
function getData(key) {
  if (!cache.has(key)) {
    cache.set(key, fetchData(key)); // Never removed!
  }
  return cache.get(key);
}

// Good: LRU cache with limit
const cache = new LRUCache({ max: 100 });
```

## Language-Specific Tips

### JavaScript/TypeScript
```javascript
// Use debugger statement
debugger; // Breaks in dev tools

// Check promise handling
Promise.resolve()
  .then(() => { throw new Error('oops'); })
  .catch(err => console.error(err)); // Always catch!

// Check async/await
try {
  await riskyOperation();
} catch (err) {
  console.error(err);
}
```

### Python
```python
# Use pdb
import pdb; pdb.set_trace()

# Better tracebacks
import traceback
traceback.print_exc()

# Check types
assert isinstance(value, expected_type), f"Expected {expected_type}, got {type(value)}"
```

### Go
```go
// Use delve debugger
// dlv debug

// Add verbose logging
if debug {
    log.Printf("DEBUG: value = %+v", value)
}

// Check errors explicitly
if err != nil {
    return fmt.Errorf("operation failed: %w", err)
}
```

## Debugging Checklist

Before you start:
- [ ] Can you reproduce the issue?
- [ ] Do you have error messages/logs?
- [ ] Do you know when it started?
- [ ] Is environment documented?

While debugging:
- [ ] Test one hypothesis at a time
- [ ] Document what you've tried
- [ ] Check assumptions
- [ ] Simplify the problem

After fixing:
- [ ] Verify fix works
- [ ] Check for similar issues
- [ ] Add regression test
- [ ] Document root cause

## Prevention

### Defensive Programming
```javascript
// Validate inputs
function processUser(user) {
  if (!user) throw new Error('User is required');
  if (!user.id) throw new Error('User ID is required');
  // ...
}

// Fail fast
function divide(a, b) {
  if (b === 0) throw new Error('Cannot divide by zero');
  return a / b;
}
```

### Comprehensive Logging
```javascript
// Structured logging
logger.info('Processing payment', {
  userId: user.id,
  amount: payment.amount,
  correlationId: request.id
});

// Error context
logger.error('Payment failed', {
  error: err.message,
  stack: err.stack,
  userId: user.id,
  paymentId: payment.id
});
```

### Testing
- Unit tests for edge cases
- Integration tests for interactions
- Property-based tests for invariants
- Chaos testing for resilience

## Mindset

**Remember:**
- The computer is doing exactly what you told it to
- The bug is in your code, not the compiler/interpreter
- Simple explanations are more likely than complex ones
- Take breaks - fresh eyes catch things
- Explain it to someone else
- Check the documentation
- Read the error message carefully
- It's usually something silly

**The 5 Whys:**
1. Why did X happen? → Because of Y
2. Why did Y happen? → Because of Z
3. Why did Z happen? → Continue until root cause
4. Usually 3-5 levels deep

Stay calm, be systematic, trust the process!