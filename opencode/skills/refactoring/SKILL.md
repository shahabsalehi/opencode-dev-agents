---
name: refactoring
description: Safe refactoring techniques, code modernization strategies, and technical debt reduction patterns for improving code quality without changing behavior.
license: MIT
compatibility: opencode
metadata:
  author: SWE Swarm Team
  version: "1.0.0"
  tags: ["refactoring", "code-quality", "modernization", "technical-debt", "maintenance"]
---

## What I Do

I guide you through safe, effective refactoring to improve code quality, reduce technical debt, and modernize codebases while preserving behavior and maintaining correctness.

## When to Use Me

- Before adding new features (clean up first)
- When code is hard to understand
- When making changes is difficult
- Performance optimization preparation
- Code review recommendations
- Legacy code modernization
- Technical debt reduction sprints

## Core Principles

### Safety First
**Never break working code.**

Before refactoring:
1. Ensure tests exist and pass
2. Version control is in place
3. You understand the code
4. You can revert if needed

### Small Steps
**Make incremental changes.**

- One refactoring at a time
- Run tests after each change
- Commit frequently
- Easy to understand diffs

### Behavior Preservation
**Refactoring changes structure, not behavior.**

If behavior changes:
- It's not refactoring
- It's a feature change
- Document and test accordingly

### Boy Scout Rule
**"Leave the campground cleaner than you found it."**

When you touch code:
- Rename unclear variables
- Extract long functions
- Remove duplication
- Add missing tests

## When to Refactor

### Green Light
- Tests exist and pass
- You understand the code
- You have time
- Code is under version control

### Yellow Light
- Complex feature additions
- Bug fixes in messy code
- Performance work

### Red Light
- Tight deadlines
- No tests
- You don't understand the code
- You're tired or stressed

**When in doubt, don't refactor. Ship working code first.**

## Common Refactorings

### 1. Extract Function/Method

**When:** Function > 20 lines or does multiple things

**Before:**
```javascript
function processOrder(order) {
  // Validation (15 lines)
  if (!order.items) throw new Error('No items');
  // ... more validation ...
  
  // Calculation (20 lines)
  let total = 0;
  // ... calculation logic ...
  
  // Persistence (10 lines)
  db.save(order);
  // ... save logic ...
}
```

**After:**
```javascript
function processOrder(order) {
  validateOrder(order);
  const total = calculateTotal(order);
  persistOrder(order, total);
}

function validateOrder(order) { /* ... */ }
function calculateTotal(order) { /* ... */ }
function persistOrder(order, total) { /* ... */ }
```

### 2. Rename Variable/Function

**When:** Names are unclear, abbreviated, or misleading

**Before:**
```javascript
const d = new Date();
const x = calc(d);
```

**After:**
```javascript
const currentDate = new Date();
const daysUntilExpiry = calculateDaysUntilExpiry(currentDate);
```

**Tips:**
- Use full words (not abbreviations)
- Names should reveal intent
- Boolean names should sound like true/false
- Function names should describe action

### 3. Replace Conditional with Polymorphism

**When:** Multiple conditionals on type

**Before:**
```javascript
function calculatePrice(product) {
  if (product.type === 'book') {
    return product.price * 0.9;
  } else if (product.type === 'electronics') {
    return product.price * 1.2;
  } else if (product.type === 'clothing') {
    return product.price * 0.8;
  }
  return product.price;
}
```

**After:**
```javascript
class Product {
  constructor(price) {
    this.price = price;
  }
  getPrice() {
    return this.price;
  }
}

class Book extends Product {
  getPrice() {
    return this.price * 0.9;
  }
}

class Electronics extends Product {
  getPrice() {
    return this.price * 1.2;
  }
}
```

### 4. Remove Duplication (DRY)

**When:** Same or similar code in multiple places

**Before:**
```javascript
function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

function validateUserEmail(user) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(user.email);
}
```

**After:**
```javascript
function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

function validateUserEmail(user) {
  return validateEmail(user.email);
}
```

### 5. Simplify Conditional Expressions

**When:** Complex or nested conditionals

**Before:**
```javascript
if (user !== null && user !== undefined) {
  if (user.isActive === true) {
    if (user.role === 'admin') {
      return true;
    }
  }
}
return false;
```

**After:**
```javascript
return user?.isActive && user.role === 'admin';
```

**Or with guard clauses:**
```javascript
if (!user?.isActive) return false;
if (user.role !== 'admin') return false;
return true;
```

### 6. Introduce Parameter Object

**When:** Function has too many parameters

**Before:**
```javascript
function createUser(
  firstName,
  lastName,
  email,
  phone,
  address,
  city,
  state,
  zip
) {
  // ...
}
```

**After:**
```javascript
function createUser(userInfo) {
  // userInfo has firstName, lastName, email, etc.
}

// Or with destructuring
function createUser({ firstName, lastName, email, phone, address }) {
  // ...
}
```

### 7. Replace Magic Numbers/Strings

**When:** Bare numbers or strings in code

**Before:**
```javascript
if (status === 200) {
  timeout = 30000;
}
```

**After:**
```javascript
const HTTP_OK = 200;
const DEFAULT_TIMEOUT_MS = 30000;

if (status === HTTP_OK) {
  timeout = DEFAULT_TIMEOUT_MS;
}
```

### 8. Split Temporary Variable

**When:** Variable is reused for different purposes

**Before:**
```javascript
let temp = 2 * (height + width);
console.log(temp);
temp = height * width;
console.log(temp);
```

**After:**
```javascript
const perimeter = 2 * (height + width);
console.log(perimeter);
const area = height * width;
console.log(area);
```

### 9. Replace Loop with Pipeline

**When:** Processing collections with loops

**Before:**
```javascript
const names = [];
for (const user of users) {
  if (user.isActive) {
    names.push(user.name.toUpperCase());
  }
}
```

**After:**
```javascript
const names = users
  .filter(user => user.isActive)
  .map(user => user.name.toUpperCase());
```

### 10. Inline Variable

**When:** Variable adds no clarity

**Before:**
```javascript
const basePrice = order.quantity * order.itemPrice;
return basePrice;
```

**After:**
```javascript
return order.quantity * order.itemPrice;
```

## Language-Specific Modernization

### JavaScript/TypeScript

**ES5 → ES6+:**
```javascript
// var → const/let
var x = 1;           → const x = 1;

// Functions → Arrow functions
function(x) { }      → (x) => { }

// String concat → Template literals
"Hello " + name      → `Hello ${name}`

// Destructuring
const name = obj.name → const { name } = obj;

// Spread operator
const copy = arr.slice() → const copy = [...arr]

// Optional chaining
obj && obj.prop      → obj?.prop

// Nullish coalescing
x !== null ? x : y   → x ?? y

// Async/await
promise.then(x => y) → const x = await promise; y
```

### Python

**Modern Python:**
```python
# format() → f-strings
"Hello {}".format(name) → f"Hello {name}"

# List operations → Comprehensions
list(map(f, items)) → [f(x) for x in items]

# Dict methods
if key in d: val = d[key] → val = d.get(key)

# Type hints
def func(x): → def func(x: int) -> str:

# Dataclasses
class Point:          → @dataclass
  def __init__(...):  → class Point:
    ...               →   x: int
                        →   y: int

# Context managers
f = open(...)         → with open(...) as f:
try:                  →   ...
  ...                 →
finally:              →
  f.close()           →
```

### Go

**Idiomatic Go:**
```go
// Error handling
if err != nil {     → Same (it's idiomatic!)
  return err
}

// Slices vs arrays
var arr [10]int     → slice := make([]int, 10)

// Struct initialization
p := Point{}        → p := Point{X: 1, Y: 2}

// Goroutines with channels
// Use for coordination
```

## Dealing with Legacy Code

### Characterization Tests

Before refactoring, write tests that document current behavior:

```javascript
describe('LegacyFunction', () => {
  it('should behave as it currently does', () => {
    const result = legacyFunction(input);
    // Document observed output
    expect(result).toEqual(/* actual output */);
  });
});
```

### Seams

Find places to insert tests:

1. **Dependency Injection**: Make dependencies injectable
2. **Method Override**: Allow methods to be overridden in tests
3. **Global State**: Encapsulate and make settable
4. **External Services**: Add interfaces/facades

### The Sprout Method

When adding features to messy code:

1. Write new code in a new method
2. Keep it clean and tested
3. Call it from old code
4. Gradually migrate to new code

```javascript
// Old messy code
function oldFunction() {
  // ... lots of messy code ...
  
  // New clean code
  const result = newCleanFunction(data);
  
  // ... more messy code ...
}

// New clean code (well-tested)
function newCleanFunction(data) {
  // Beautiful, tested code
}
```

## Refactoring Workflow

### Before Starting
- [ ] Tests exist and pass
- [ ] Version control committed
- [ ] You understand the code
- [ ] Time allocated

### During Refactoring
- [ ] One refactoring at a time
- [ ] Tests pass after each step
- [ ] Commit frequently
- [ ] Small, focused changes

### After Refactoring
- [ ] All tests pass
- [ ] Behavior is preserved
- [ ] Code is cleaner
- [ ] Documentation updated
- [ ] Code review requested

## Large-Scale Refactoring

### The Strangler Fig Pattern

Don't rewrite everything at once:

```
Phase 1: Create new implementation alongside old
Phase 2: Route some traffic to new code
Phase 3: Gradually migrate all traffic
Phase 4: Remove old code
```

Example:
```javascript
// Routing logic
function userService(action, data) {
  if (useNewService) {
    return newUserService[action](data);
  }
  return oldUserService[action](data);
}
```

### The Branch by Abstraction Pattern

1. Create abstraction layer
2. Make existing code implement it
3. Build new implementation
4. Switch over
5. Remove old implementation

## Code Smells to Address

### Bloaters
- **Long Method**: > 20 lines
- **Large Class**: Too many responsibilities
- **Primitive Obsession**: Using primitives instead of objects
- **Long Parameter List**: > 3-4 parameters
- **Data Clumps**: Groups of data always together

### Object-Orientation Abusers
- **Switch Statements**: Replace with polymorphism
- **Temporary Field**: Field only set sometimes
- **Refused Bequest**: Subclass doesn't use parent behavior
- **Alternative Classes**: Different interfaces, same purpose

### Change Preventers
- **Divergent Change**: One class changed for many reasons
- **Shotgun Surgery**: One change requires many classes
- **Parallel Inheritance**: Subclasses in parallel hierarchies

### Dispensables
- **Comments**: Explain why, not what
- **Duplicate Code**: Extract and reuse
- **Lazy Class**: Class that does too little
- **Data Class**: Class with only fields/getters/setters
- **Dead Code**: Unused code
- **Speculative Generality**: Code for future needs

### Couplers
- **Feature Envy**: Method uses more of another class
- **Inappropriate Intimacy**: Classes too tightly coupled
- **Message Chains**: `a.getB().getC().doSomething()`
- **Middleman**: Class just delegates to another

## Testing Refactored Code

### Regression Tests
Ensure behavior is preserved:

```javascript
describe('After refactoring', () => {
  const testCases = [
    { input: ..., expected: ... },
    { input: ..., expected: ... },
  ];
  
  testCases.forEach(({ input, expected }) => {
    it(`produces same output for ${input}`, () => {
      expect(refactoredFunction(input)).toEqual(expected);
    });
  });
});
```

### Snapshot Testing
For UI or complex output:

```javascript
it('should match snapshot', () => {
  const result = renderComponent();
  expect(result).toMatchSnapshot();
});
```

## Communication Template

```
## Refactoring: [Description]

### Motivation
Why this refactoring was needed

### Changes
1. [Change 1]
2. [Change 2]
3. [Change 3]

### Impact
- Lines of code: X → Y
- Cyclomatic complexity: X → Y
- Number of functions: X → Y

### Testing
- [ ] All existing tests pass
- [ ] New tests added where needed
- [ ] Manual testing performed
- [ ] Behavior verified unchanged

### Risks
- [Low/Medium/High] - Explanation
```

Remember: Refactoring is about making code easier to understand and modify. If you can't explain the change simply, it's probably too complex. When in doubt, keep it simple!