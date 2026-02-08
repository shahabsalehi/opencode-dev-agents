---
description: Identify and fix performance bottlenecks in code. Profiles execution, analyzes algorithms, optimizes resource usage, and applies performance improvements while maintaining correctness.
agent: perf-optimizer
model: anthropic/claude-sonnet-4-20250514
subtask: false
---

Optimize code performance and resource usage.

## Usage
```
/optimize-code [target] [metric]
```

## Arguments
- **target**: File(s) or directory to optimize (default: src/)
- **metric**: Primary metric - speed, memory, or all (default: speed)
- **aggressiveness**: Level of optimization - conservative, balanced, aggressive (default: balanced)

## Examples
```
/optimize-code src/
/optimize-code src/database.js memory
/optimize-code src/api --aggressiveness conservative
```

## Process

### 1. Profile Current Performance
Use codeAnalyzer and profiling tools:
```javascript
codeAnalyzer {
  target: "$1",
  metrics: ["performance", "complexity"]
}
```

### 2. Identify Bottlenecks
Look for:
- High complexity algorithms
- N+1 query patterns
- Excessive memory allocation
- Synchronous I/O
- Missing caching

### 3. Plan Optimizations
Prioritize by:
- Impact on user experience
- Frequency of execution
- Implementation complexity
- Risk level

### 4. Apply Optimizations
Use refactorEngine:
```javascript
refactorEngine {
  files: [bottleneck files],
  transformation: "modernize-syntax",
  // Apply specific optimizations
}
```

Common optimizations:
- Algorithm improvements
- Caching strategies
- Lazy loading
- Batching operations
- Async/concurrent execution

### 5. Measure Improvements
Benchmark before/after:
```javascript
// Measure execution time
console.time('operation');
// ... optimized code ...
console.timeEnd('operation');
```

### 6. Validate
- Verify correctness
- Check no regressions
- Profile again to confirm
- Run stress tests

## Optimization Areas

### Algorithmic
- Replace O(n²) with O(n log n)
- Use appropriate data structures
- Avoid nested loops where possible

### Memory
- Reduce object allocation
- Use object pooling
- Clear references for GC
- Stream large data

### I/O
- Batch operations
- Use async I/O
- Implement caching
- Compress data

### Database
- Add indexes
- Optimize queries
- Use connection pooling
- Implement query caching

### Network
- Minimize requests
- Enable compression
- Use CDN
- Implement caching headers

## Safety

- Always measure before optimizing
- Verify behavior unchanged
- Start with conservative changes
- Profile after each optimization

## Output

Reports:
- Baseline performance
- Bottlenecks identified
- Optimizations applied
- Performance improvement
- Remaining opportunities