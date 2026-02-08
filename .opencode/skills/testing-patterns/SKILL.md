---
name: testing-patterns
description: Comprehensive testing strategies, patterns, and best practices for creating effective, maintainable test suites across different testing levels and frameworks.
license: MIT
compatibility: opencode
metadata:
  author: SWE Swarm Team
  version: "1.0.0"
  tags: ["testing", "tdd", "quality", "automation", "coverage"]
---

## What I Do

I guide you in creating effective, maintainable test suites that provide confidence in your code. I cover testing strategies, patterns, and best practices across all testing levels.

## When to Use Me

- Writing new tests
- Reviewing test quality
- Improving test coverage
- Setting up testing infrastructure
- Debugging test failures
- Choosing testing strategies
- Optimizing test performance

## Testing Philosophy

### The Goal: Confidence
Tests should give you confidence to:
- Refactor without fear
- Deploy on Fridays
- Add new features safely
- Catch bugs before production

**Not:** Perfect coverage numbers

### Test Pyramid
```
         /\
        /  \
       / E2E \          ← Few tests (5-10%)
      /--------\            Slow, expensive
     /Integration\       ← Some tests (20-30%)
    /--------------\         Component interactions
   /    Unit Tests   \    ← Many tests (60-70%)
  /--------------------\     Fast, isolated
```

**Balance:** Most tests should be fast unit tests. Fewer integration tests. Very few E2E tests.

### FIRST Principles

**F**ast: Tests should run quickly
- Under 10ms per test ideally
- Under 1 second for entire suite ideally
- Slow tests won't be run often

**I**ndependent: No test depends on another
- Each test sets up its own state
- Tests can run in any order
- Parallel execution possible

**R**epeatable: Same results every time
- No hardcoded timestamps
- No random data without seeding
- No external state dependency

**S**elf-validating: Pass or fail, no manual check
- No logging to verify
- No "eyeballing" results
- Assertions are explicit

**T**imely: Write tests with or before code
- TDD: Test first
- At minimum: Test during
- Never: "I'll test later" (you won't)

## Testing Levels

### Unit Tests

**What to test:**
- Individual functions/methods
- Classes in isolation
- Pure logic

**Characteristics:**
- Fast (< 10ms)
- Isolated (no I/O)
- Deterministic
- Many of them

**Example:**
```javascript
describe('calculateTotal', () => {
  it('should sum item prices', () => {
    const items = [{ price: 10 }, { price: 20 }];
    expect(calculateTotal(items)).toBe(30);
  });
  
  it('should handle empty cart', () => {
    expect(calculateTotal([])).toBe(0);
  });
  
  it('should apply discount', () => {
    const items = [{ price: 100 }];
    expect(calculateTotal(items, 0.1)).toBe(90);
  });
});
```

### Integration Tests

**What to test:**
- Component interactions
- Database integration
- API endpoints
- External service integration

**Characteristics:**
- Slower (10ms - 1s)
- Some I/O (test database)
- Test real interactions
- Fewer than unit tests

**Example:**
```javascript
describe('UserRepository', () => {
  it('should save and retrieve user', async () => {
    const user = { name: 'John', email: 'john@example.com' };
    const saved = await userRepo.save(user);
    const found = await userRepo.findById(saved.id);
    expect(found).toEqual(saved);
  });
});
```

### E2E Tests

**What to test:**
- User workflows
- Critical paths
- Cross-system integration

**Characteristics:**
- Slow (> 1s)
- Full stack
- Flakier
- Very few

**Example:**
```javascript
describe('Checkout Flow', () => {
  it('should complete purchase', async () => {
    await page.goto('/products');
    await page.click('[data-testid="add-to-cart"]');
    await page.click('[data-testid="checkout"]');
    await page.fill('[name="email"]', 'test@example.com');
    await page.click('[data-testid="place-order"]');
    await expect(page).toHaveText('Order confirmed');
  });
});
```

## Test Patterns

### AAA Pattern (Arrange-Act-Assert)

```javascript
it('should calculate discount', () => {
  // Arrange
  const cart = new Cart();
  cart.addItem({ price: 100, quantity: 2 });
  const discountCalculator = new DiscountCalculator();
  
  // Act
  const discount = discountCalculator.calculate(cart);
  
  // Assert
  expect(discount).toBe(20);
});
```

### Given-When-Then (BDD Style)

```javascript
describe('Shopping Cart', () => {
  it('should apply discount for premium members', () => {
    // Given
    const user = createUser({ isPremium: true });
    const cart = createCart(user);
    cart.addItems([
      { price: 100 },
      { price: 50 }
    ]);
    
    // When
    const total = cart.getTotal();
    
    // Then
    expect(total).toBe(135); // 10% discount applied
  });
});
```

### Table-Driven Tests

```javascript
describe('isValidEmail', () => {
  const testCases = [
    { input: 'user@example.com', expected: true },
    { input: 'user.name@example.co.uk', expected: true },
    { input: 'invalid-email', expected: false },
    { input: '@example.com', expected: false },
    { input: 'user@', expected: false },
    { input: '', expected: false },
  ];
  
  testCases.forEach(({ input, expected }) => {
    it(`should return ${expected} for "${input}"`, () => {
      expect(isValidEmail(input)).toBe(expected);
    });
  });
});
```

### Parameterized Tests

```javascript
// Jest
test.each([
  [1, 1, 2],
  [2, 2, 4],
  [10, 20, 30],
])('.add(%i, %i) returns %i', (a, b, expected) => {
  expect(add(a, b)).toBe(expected);
});

// Pytest
@pytest.mark.parametrize("a,b,expected", [
    (1, 1, 2),
    (2, 2, 4),
    (10, 20, 30),
])
def test_add(a, b, expected):
    assert add(a, b) == expected
```

### Property-Based Testing

```javascript
// Test properties that should always hold
fc.assert(
  fc.property(fc.string(), fc.string(), (a, b) => {
    // Property: concatenation length equals sum of lengths
    expect((a + b).length).toBe(a.length + b.length);
  })
);

fc.assert(
  fc.property(fc.array(fc.integer()), (arr) => {
    // Property: sorting preserves elements
    const sorted = [...arr].sort((a, b) => a - b);
    expect(sorted).toHaveLength(arr.length);
    expect(sorted.every(x => arr.includes(x))).toBe(true);
  })
);
```

## What to Test

### Happy Path
Normal operation with valid input
```javascript
it('should create user with valid data', () => {
  const user = createUser({ name: 'John', email: 'john@example.com' });
  expect(user.name).toBe('John');
  expect(user.email).toBe('john@example.com');
});
```

### Edge Cases
Boundaries and special values
```javascript
it('should handle empty input', () => { });
it('should handle maximum value', () => { });
it('should handle minimum value', () => { });
it('should handle whitespace', () => { });
it('should handle unicode', () => { });
```

### Error Cases
Invalid input and failure modes
```javascript
it('should throw for null input', () => {
  expect(() => processUser(null)).toThrow('User is required');
});

it('should throw for invalid email', () => {
  expect(() => createUser({ email: 'invalid' })).toThrow('Invalid email');
});
```

### Async Behavior
```javascript
it('should resolve with data', async () => {
  const result = await fetchUser(1);
  expect(result).toEqual({ id: 1, name: 'John' });
});

it('should reject on error', async () => {
  await expect(fetchUser(999)).rejects.toThrow('User not found');
});
```

## Mocking

### When to Mock
- **DO**: External services, databases, filesystem
- **DO**: Slow operations, non-deterministic functions
- **DON'T**: Your own code (test real implementation)
- **DON'T**: Value objects

### Mock Best Practices

```javascript
// Mock at boundary
jest.mock('../api', () => ({
  fetchUser: jest.fn()
}));

// Setup default response
beforeEach(() => {
  fetchUser.mockResolvedValue({ id: 1, name: 'John' });
});

// Test specific behavior
it('should retry on failure', async () => {
  fetchUser
    .mockRejectedValueOnce(new Error('Network error'))
    .mockResolvedValueOnce({ id: 1 });
  
  const result = await fetchUserWithRetry(1);
  expect(fetchUser).toHaveBeenCalledTimes(2);
  expect(result).toEqual({ id: 1 });
});

// Verify interactions
it('should cache results', async () => {
  await service.getUser(1);
  await service.getUser(1);
  expect(fetchUser).toHaveBeenCalledTimes(1);
});
```

## Test Quality

### Good Test Names
```javascript
// Good - describes behavior
it('should send welcome email to new users', () => {});
it('should reject payments over $10,000', () => {});
it('should apply 10% discount for premium members', () => {});

// Bad - describes implementation
it('should call emailService.send', () => {});
it('should set isValid to false', () => {});
it('test function calculateDiscount', () => {});
```

### Clear Assertions
```javascript
// Good - clear what we're checking
expect(user.isActive).toBe(true);
expect(cart.items).toHaveLength(3);
expect(order.total).toBeGreaterThan(0);

// Bad - vague
expect(result).toBeTruthy();
expect(data).toBeDefined();
expect(value).not.toBeNull();
```

### One Concept Per Test
```javascript
// Good - separate concerns
it('should calculate subtotal correctly', () => {});
it('should apply tax to subtotal', () => {});
it('should apply discount after tax', () => {});

// Bad - testing multiple things
it('should work', () => {
  // tests subtotal, tax, and discount
});
```

## Code Coverage

### Coverage Types

- **Line**: % of lines executed
- **Branch**: % of decision branches taken
- **Function**: % of functions called
- **Statement**: % of statements executed

### Coverage Targets
```
Minimum acceptable:
- Lines: 80%
- Functions: 90%
- Branches: 70%

Ideal:
- Lines: 90%
- Functions: 95%
- Branches: 85%
```

### Don't Game Coverage
```javascript
// Bad - coverage padding
if (condition) {
  // tested
} else {
  // also tested but does nothing meaningful
}

// Good - meaningful coverage
// Every line represents real behavior
```

## Test Organization

### File Structure
```
src/
  components/
    Button.tsx
    Button.test.tsx
  utils/
    helpers.ts
    helpers.test.ts
tests/
  integration/
    api.test.ts
  e2e/
    checkout.spec.ts
```

### Test Structure
```javascript
describe('Component', () => {
  describe('when user is logged in', () => {
    describe('and has premium subscription', () => {
      it('should show premium features', () => {});
    });
    
    describe('and has basic subscription', () => {
      it('should show basic features', () => {});
    });
  });
  
  describe('when user is logged out', () => {
    it('should show login button', () => {});
  });
});
```

## Test Maintenance

### Keep Tests Fast
```javascript
// Use in-memory database
// Mock slow operations
// Parallelize tests
// Don't test through UI when unit test will do
```

### Avoid Brittle Tests
```javascript
// Brittle - tests implementation
expect(component.instance().state.count).toBe(5);

// Better - tests behavior
expect(screen.getByText('Count: 5')).toBeInTheDocument();
```

### Update Tests with Code
- When you change code, update tests
- Delete tests for deleted functionality
- Refactor tests like production code

## Testing Checklist

When writing tests:
- [ ] Test is readable and self-documenting
- [ ] Test name describes behavior
- [ ] Assertions are specific
- [ ] Test is independent
- [ ] Test runs fast
- [ ] Edge cases covered
- [ ] Error cases covered
- [ ] Mocks at appropriate boundaries

When reviewing tests:
- [ ] Tests would catch regression
- [ ] Tests are maintainable
- [ ] No duplication
- [ ] No testing implementation details
- [ ] Coverage is meaningful

Remember: Tests are documentation. Write them so future developers (including you) can understand the expected behavior!