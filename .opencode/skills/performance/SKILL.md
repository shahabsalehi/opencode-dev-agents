---
name: performance
description: Performance optimization strategies, profiling techniques, and efficiency patterns for making software faster, more scalable, and resource-efficient.
license: MIT
compatibility: opencode
metadata:
  author: SWE Swarm Team
  version: "1.0.0"
  tags: ["performance", "optimization", "profiling", "scalability", "efficiency"]
---

## What I Do

I guide you through systematic performance optimization, from profiling and bottleneck identification to implementing efficient solutions that scale.

## When to Use Me

- Application is slow
- High resource usage (CPU/memory)
- Scaling challenges
- Timeout issues
- User complaints about speed
- Before major launches
- Regular performance audits

## Core Principles

### 1. Measure First
**Never optimize without profiling.**

Common mistakes:
- Assume what's slow
- Optimize initialization code
- Micro-optimize everything
- Make code complex for marginal gains

Correct approach:
1. Profile to find actual bottlenecks
2. Focus on hot paths
3. Measure improvement
4. Verify correctness

### 2. The 80/20 Rule (Pareto Principle)
80% of execution time is spent in 20% of code.

Focus on:
- Hot paths (frequently executed)
- Critical paths (user-facing)
- Bottlenecks (constrained resources)

Don't waste time on:
- Initialization code
- Rarely used features
- Already fast code

### 3. Trade-offs Exist
Every optimization has costs:

**Time vs Space:**
- Faster often means more memory
- Caching uses RAM for speed
- Pre-computation uses storage

**Complexity vs Performance:**
- Fast code can be harder to understand
- Clever algorithms need documentation
- Optimization adds maintenance burden

**Development vs Runtime:**
- More time optimizing = less time shipping
- Is the gain worth the effort?

### 4. Correctness First
**Fast and wrong is useless.**

Ensure:
- Behavior is preserved
- Edge cases handled
- Tests pass
- No regressions

## The Optimization Process

### Phase 1: Establish Baseline

Measure current performance:

```javascript
// Simple timing
console.time('operation');
// ... code ...
console.timeEnd('operation');

// Benchmark function
function benchmark(fn, iterations = 1000) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  return {
    avg: times.reduce((a, b) => a + b) / times.length,
    min: Math.min(...times),
    max: Math.max(...times)
  };
}
```

### Phase 2: Profile

Find actual bottlenecks:

#### JavaScript/Node.js
```bash
# CPU profiling
node --prof app.js
node --prof-process isolate-*.log > profile.txt

# Heap profiling
node --inspect app.js
# Use Chrome DevTools
```

#### Python
```bash
# cProfile
python -m cProfile -o output.prof script.py

# line_profiler
@profile
def my_function():
    pass
kernprof -l -v script.py
```

#### Go
```bash
# CPU profile
go test -bench=. -cpuprofile=cpu.prof
go tool pprof cpu.prof

# Memory profile
go test -bench=. -memprofile=mem.prof
```

### Phase 3: Identify Bottlenecks

Common bottlenecks:

#### Algorithmic Complexity
```javascript
// O(n²) - Slow for large n
for (let i = 0; i < items.length; i++) {
  for (let j = 0; j < items.length; j++) {
    // work
  }
}

// O(n log n) - Much faster
items.sort((a, b) => a.key - b.key);
// Binary search or two-pointer technique
```

#### I/O Operations
```javascript
// Slow: Sequential blocking I/O
for (const file of files) {
  const data = fs.readFileSync(file);
}

// Fast: Parallel async I/O
const data = await Promise.all(
  files.map(file => fs.promises.readFile(file))
);
```

#### Database Queries
```javascript
// N+1 Query Problem
const users = await db.getUsers();
for (const user of users) {
  user.orders = await db.getOrders(user.id); // N queries!
}

// Single query with join
const usersWithOrders = await db.query(`
  SELECT users.*, orders.*
  FROM users
  LEFT JOIN orders ON users.id = orders.user_id
`);
```

#### Memory Allocation
```javascript
// Creates many temporary objects
const result = items
  .map(x => x * 2)
  .filter(x => x > 10)
  .reduce((a, b) => a + b, 0);

// Single pass, less memory
let sum = 0;
for (const item of items) {
  const doubled = item * 2;
  if (doubled > 10) {
    sum += doubled;
  }
}
```

### Phase 4: Optimize

Apply appropriate techniques (see Optimization Patterns below)

### Phase 5: Verify

Measure improvement:

```javascript
const before = benchmark(() => oldFunction(data));
const after = benchmark(() => optimizedFunction(data));

console.log(`Speedup: ${(before.avg / after.avg).toFixed(2)}x`);
console.log(`Time saved: ${(before.avg - after.avg).toFixed(2)}ms per call`);

// Calculate impact
const callsPerDay = 1000000;
const dailyTimeSaved = (before.avg - after.avg) * callsPerDay / 1000;
console.log(`Daily time saved: ${dailyTimeSaved.toFixed(0)} seconds`);
```

## Optimization Patterns

### 1. Caching/Memoization

Store expensive computations:

```javascript
// Without caching
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
// fibonacci(50) = 40+ seconds

// With memoization
const cache = new Map();
function fibonacci(n) {
  if (cache.has(n)) return cache.get(n);
  if (n <= 1) return n;
  const result = fibonacci(n - 1) + fibonacci(n - 2);
  cache.set(n, result);
  return result;
}
// fibonacci(50) = < 1ms
```

**Cache strategies:**
- LRU (Least Recently Used)
- TTL (Time To Live)
- Size-limited
- Weak references (for memory-sensitive)

### 2. Lazy Loading

Defer initialization until needed:

```javascript
// Eager loading
class HeavyService {
  constructor() {
    this.data = this.loadAllData(); // Expensive!
  }
}

// Lazy loading
class HeavyService {
  constructor() {
    this._data = null;
  }
  
  get data() {
    if (!this._data) {
      this._data = this.loadAllData();
    }
    return this._data;
  }
}
```

### 3. Batching

Combine operations:

```javascript
// Individual requests
for (const id of ids) {
  await api.deleteUser(id);
}

// Batch request
await api.deleteUsers(ids);
```

### 4. Debouncing and Throttling

Limit execution rate:

```javascript
// Debounce: Execute after pause
const debouncedSearch = debounce((query) => {
  performSearch(query);
}, 300);

// Throttle: Limit execution rate
const throttledScroll = throttle(() => {
  updatePosition();
}, 100);
```

### 5. Efficient Data Structures

Choose appropriate structures:

```javascript
// Array: O(n) lookup, O(1) push
const array = [1, 2, 3];
array.includes(2); // O(n)

// Set: O(1) lookup
const set = new Set([1, 2, 3]);
set.has(2); // O(1)

// Map: O(1) key lookup
const map = new Map([['a', 1], ['b', 2]]);
map.get('a'); // O(1)

// Object: Good for fixed schemas
const obj = { a: 1, b: 2 };
```

### 6. Avoid Work

The fastest code is code that doesn't run:

```javascript
// Early returns
function processData(data) {
  if (!data) return null;
  if (data.length === 0) return [];
  // ... expensive processing ...
}

// Short-circuit evaluation
if (isCached(key) || expensiveOperation()) {
  // expensiveOperation only runs if not cached
}
```

### 7. Pre-computation

Compute once, use many times:

```javascript
// Compute at runtime
function isValidFormat(str) {
  const regex = /^[a-z]+$/i; // Created every call
  return regex.test(str);
}

// Pre-compute
const VALID_FORMAT_REGEX = /^[a-z]+$/i;
function isValidFormat(str) {
  return VALID_FORMAT_REGEX.test(str);
}
```

### 8. Vectorization

Operate on collections at once:

```python
# Slow: Python loop
result = []
for x in items:
    result.append(x * 2)

# Fast: NumPy vectorization
import numpy as np
result = np.array(items) * 2
```

### 9. Async/Promise.all

Parallelize independent operations:

```javascript
// Sequential
const user = await getUser(id);
const orders = await getOrders(id);
const preferences = await getPreferences(id);

// Parallel
const [user, orders, preferences] = await Promise.all([
  getUser(id),
  getOrders(id),
  getPreferences(id)
]);
```

### 10. Streaming

Process data in chunks:

```javascript
// Load entire file
const data = fs.readFileSync('huge-file.txt');
process(data);

// Stream chunks
const stream = fs.createReadStream('huge-file.txt');
stream.on('data', chunk => process(chunk));
```

## Language-Specific Optimizations

### JavaScript/TypeScript

```javascript
// Use const/let for engine optimizations
const arr = [];

// Avoid delete (de-optimizes objects)
// Instead:
obj[key] = undefined;

// Use for...of instead of forEach
for (const item of items) { }

// Use Map for frequent additions/removals
const map = new Map();

// Typed arrays for numeric data
const nums = new Float64Array(1000);

// Object pooling for GC pressure reduction
const pool = [];
function getObject() {
  return pool.pop() || {};
}
function releaseObject(obj) {
  pool.push(obj);
}
```

### Python

```python
# List comprehensions over loops
result = [x * 2 for x in items]

# Generators for large datasets
def process_large_file():
    with open('huge.txt') as f:
        for line in f:
            yield process(line)

# lru_cache for memoization
from functools import lru_cache

@lru_cache(maxsize=128)
def expensive_function(x):
    return x ** x

# Use slots for memory efficiency
class Point:
    __slots__ = ['x', 'y']
    def __init__(self, x, y):
        self.x = x
        self.y = y

# NumPy for numeric operations
import numpy as np
arr = np.array([1, 2, 3])
result = arr * 2  # Vectorized

# String building
# Bad: s += part (creates new string each time)
# Good:
parts = []
for part in parts_list:
    parts.append(part)
result = ''.join(parts)
```

### Go

```go
// Pre-allocate slices
// Bad:
var result []int
for i := 0; i < 1000; i++ {
    result = append(result, i) // May reallocate multiple times
}

// Good:
result := make([]int, 0, 1000)
for i := 0; i < 1000; i++ {
    result = append(result, i)
}

// Reuse buffers
var bufPool = sync.Pool{
    New: func() interface{} {
        return make([]byte, 1024)
    },
}

func process() {
    buf := bufPool.Get().([]byte)
    defer bufPool.Put(buf)
    // Use buf...
}

// Avoid unnecessary allocations
// Use string.Builder for string concatenation
var b strings.Builder
b.WriteString("Hello ")
b.WriteString("World")
result := b.String()
```

## Database Optimization

### Query Optimization
```sql
-- Add indexes for frequent queries
CREATE INDEX idx_users_email ON users(email);

-- Use EXPLAIN to analyze queries
EXPLAIN SELECT * FROM users WHERE email = 'test@example.com';

-- Select only needed columns
SELECT id, name FROM users; -- Not SELECT *

-- Use LIMIT for pagination
SELECT * FROM users LIMIT 10 OFFSET 20;

-- Batch inserts
INSERT INTO users (name) VALUES ('a'), ('b'), ('c'); -- Not 3 separate inserts
```

### Connection Pooling
```javascript
// Use connection pool
const pool = new Pool({
  max: 20, // Maximum connections
  idleTimeoutMillis: 30000
});
```

## Web Performance

### Frontend
```javascript
// Lazy load components
const HeavyComponent = lazy(() => import('./HeavyComponent'));

// Code splitting
import(/* webpackChunkName: "lodash" */ 'lodash').then(_ => {
  // Use lodash
});

// Debounce user input
const debouncedSearch = debounce(handleSearch, 300);

// Intersection Observer for lazy images
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      loadImage(entry.target);
    }
  });
});
```

### Backend
```javascript
// Enable compression
app.use(compression());

// Cache headers
res.set('Cache-Control', 'public, max-age=31536000');

// CDN for static assets
const assetUrl = 'https://cdn.example.com/image.png';

// Database query caching
const cachedResult = await cache.get(key);
if (cachedResult) return cachedResult;
const result = await db.query(sql);
await cache.set(key, result, 300);
return result;
```

## Memory Optimization

### Detecting Memory Issues
```javascript
// Monitor heap usage
setInterval(() => {
  const used = process.memoryUsage();
  console.log(`Heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
}, 5000);
```

### Common Memory Issues
- Global caches without limits
- Event listeners not removed
- Closures capturing large objects
- Large data structures in memory
- Memory leaks in long-running processes

### Solutions
```javascript
// LRU cache
const LRU = require('lru-cache');
const cache = new LRU({ max: 500 });

// Remove event listeners
componentWillUnmount() {
  window.removeEventListener('resize', this.handler);
}

// Stream large data
const stream = fs.createReadStream('large-file.csv');
stream.pipe(csvParser).pipe(transform).pipe(output);
```

## Scalability

### Horizontal Scaling
```javascript
// Stateless design
// Store session in Redis, not memory
// Share-nothing architecture

// Load balancing
// Multiple server instances
// Round-robin or least-connections

// Database sharding
// Split data across multiple databases
// Based on user_id or geographic region
```

### Caching Layers
```
Browser Cache → CDN → Load Balancer → Application Cache → Database
     ↑            ↑          ↑              ↑                ↑
   Static      Static    Routing      Computed         Source
   Assets      Assets    Decisions    Results          of Truth
```

## Monitoring

### Performance Metrics
```javascript
// Track important metrics
performance.mark('api-start');
const result = await api.call();
performance.mark('api-end');
performance.measure('api-call', 'api-start', 'api-end');

// Send to monitoring
metrics.timing('api.response_time', duration);
metrics.gauge('api.active_requests', activeCount);
metrics.increment('api.requests');
```

### SLIs and SLOs
**SLI** (Service Level Indicator): What to measure
- Response time
- Error rate
- Throughput

**SLO** (Service Level Objective): Target
- 99th percentile latency < 200ms
- Error rate < 0.1%
- 99.9% availability

## Anti-Patterns

### Premature Optimization
```javascript
// Don't do this without profiling!
const result = ~~(number / 2); // Unclear
// Instead:
const result = Math.floor(number / 2); // Clear
```

### Optimizing the Wrong Thing
Focus on hot paths, not initialization.

### Sacrificing Readability
```javascript
// Fast but incomprehensible
const r=(a,b,c)=>a*b<<c;

// Slightly slower but clear
function calculateResult(a, b, c) {
  return (a * b) << c;
}
```

### Ignoring Big O
Linear search in a loop = O(n²)

## Performance Checklist

Before optimizing:
- [ ] You have profiling data
- [ ] You've identified the bottleneck
- [ ] You have a baseline measurement

While optimizing:
- [ ] Change one thing at a time
- [ ] Measure after each change
- [ ] Verify correctness maintained

After optimizing:
- [ ] Improvement is significant (> 20%)
- [ ] Code is still readable
- [ ] Tests still pass
- [ ] No regressions

## Communication Template

```
## Performance Optimization Report

### Problem
[Description of performance issue]

### Baseline
- Metric: [e.g., response time]
- Before: X [units]
- Target: Y [units]

### Changes
1. [Change with rationale]
2. [Change with rationale]

### Results
- After: Z [units]
- Improvement: X%
- Impact: [e.g., 1000 req/day × 50ms = 50 seconds saved]

### Trade-offs
- [Any costs or complexity added]

### Validation
- [ ] Correctness verified
- [ ] Load tested
- [ ] Production metrics improved
```

Remember: Performance is a feature, but correctness is mandatory. Optimize thoughtfully, measure rigorously, and always prioritize maintainability unless you're in a truly performance-critical path!