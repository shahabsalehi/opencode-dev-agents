# 🤖 SWE Swarm Plugin

Advanced Software Engineering Swarm Plugin for OpenCode - Fast, efficient code analysis, generation, and optimization with minimal token usage and context bloat.

## 🎯 Overview

The SWE Swarm Plugin transforms your development workflow by providing:

- **6 Specialized AI Agents** working in parallel
- **5 Powerful Tools** for code analysis and transformation
- **5 Comprehensive Skills** for knowledge sharing
- **4 Quick-Action Commands** for common tasks
- **Smart Context Management** to minimize token usage
- **Intelligent Hooks** for performance tracking

## 🚀 Quick Start

### Installation

```bash
# Install the plugin
npm install swe-sworm-plugin

# Or link for development
npm link
```

### Basic Usage

```bash
# Analyze code quality
/opencode codeAnalyzer target=src/

# Review code changes
/opencode review-pr

# Generate tests
/opencode generate-tests src/utils

# Fix bugs automatically
/opencode fix-bugs src/

# Optimize performance
/opencode optimize-code src/
```

### Using Specialized Agents

```bash
# Delegate to specific agents
@code-architect Design a new authentication system
@code-reviewer Review this pull request
@bug-hunter Find the memory leak in src/cache.ts
@test-writer Create tests for src/payments.ts
@refactor-bot Refactor this legacy code
@perf-optimizer Optimize database queries
```

## 🎭 Agents (The Swarm)

### 1. Code Architect 👷
**Purpose**: System design and architecture

**Best for**:
- Designing scalable architectures
- Defining component boundaries
- Creating modular systems
- Planning feature implementations

**Example**:
```
@code-architect Design a microservices architecture 
for our payment system with high availability requirements
```

### 2. Code Reviewer 🔍
**Purpose**: Comprehensive quality assurance

**Best for**:
- PR reviews
- Security audits
- Performance analysis
- Best practices enforcement

**Example**:
```
@code-reviewer Review this PR for security vulnerabilities 
and performance issues
```

### 3. Bug Hunter 🐛
**Purpose**: Systematic debugging and root cause analysis

**Best for**:
- Finding elusive bugs
- Analyzing stack traces
- Race condition detection
- Memory leak hunting

**Example**:
```
@bug-hunter This function intermittently fails in production. 
The error is "Cannot read property of undefined"
```

### 4. Test Writer 🧪
**Purpose**: Comprehensive test generation

**Best for**:
- Generating test coverage
- Creating edge cases
- Property-based testing
- Mock configuration

**Example**:
```
@test-writer Create comprehensive tests for the user 
authentication module including edge cases
```

### 5. Refactor Bot 🔧
**Purpose**: Safe code modernization

**Best for**:
- Reducing technical debt
- Modernizing syntax
- Extracting functions
- Removing duplication

**Example**:
```
@refactor-bot Modernize this ES5 code to ES6+ and 
extract the validation logic into separate functions
```

### 6. Performance Optimizer ⚡
**Purpose**: Speed and efficiency improvements

**Best for**:
- Algorithm optimization
- Resource usage reduction
- Database query tuning
- Caching strategies

**Example**:
```
@perf-optimizer This API endpoint is slow under load. 
Profile and optimize the database queries.
```

## 🛠️ Tools

### 1. Code Analyzer
Analyzes code for complexity, quality, security, and performance issues.

**Usage**:
```javascript
codeAnalyzer {
  target: "src/",
  metrics: ["complexity", "security", "performance"],
  threshold: 70
}
```

**Returns**:
- Complexity metrics
- Quality issues
- Security vulnerabilities
- Performance anti-patterns
- Maintainability scores

### 2. Dependency Graph
Maps code dependencies to understand relationships and minimize context.

**Usage**:
```javascript
dependencyGraph {
  entryPoints: ["src/index.ts"],
  depth: 5,
  direction: "both"
}
```

**Returns**:
- Dependency tree
- Circular dependencies
- Orphan files
- Key files by impact

### 3. Test Generator
Generates comprehensive tests with high coverage.

**Usage**:
```javascript
testGenerator {
  sourceFiles: ["src/utils.ts"],
  framework: "jest",
  coverage: "branch"
}
```

**Returns**:
- Generated test files
- Test cases for edge cases
- Mock configurations
- Coverage predictions

### 4. Bug Detector
Detects common bug patterns and potential issues.

**Usage**:
```javascript
bugDetector {
  scope: "src/",
  patterns: ["security", "logic", "concurrency"],
  severity: "high"
}
```

**Returns**:
- Detected bugs by category
- Severity ratings
- Fix suggestions
- Security vulnerabilities

### 5. Refactor Engine
Performs safe code transformations.

**Usage**:
```javascript
refactorEngine {
  files: ["src/legacy.js"],
  transformation: "modernize-syntax",
  preview: true
}
```

**Transformations**:
- `modernize-syntax`: Convert to modern syntax
- `remove-dead-code`: Clean up unused code
- `extract-function`: Pull out code blocks
- `rename-symbol`: Rename variables/functions
- `optimize-imports`: Sort and organize

## 📚 Skills

### 1. Code Review
Comprehensive code review patterns and best practices.

**Covers**:
- Security checklist
- Quality standards
- Performance guidelines
- Testing requirements
- Communication templates

### 2. Debugging
Systematic debugging methodologies.

**Covers**:
- Debugging process
- Stack trace analysis
- Race condition detection
- Memory leak hunting
- Language-specific tips

### 3. Testing Patterns
Testing strategies and patterns.

**Covers**:
- Test pyramid
- Test patterns (AAA, BDD)
- Mocking strategies
- Coverage targets
- Language-specific frameworks

### 4. Refactoring
Safe refactoring techniques.

**Covers**:
- Common refactorings
- Code smells
- Legacy code strategies
- Language modernization
- Testing refactored code

### 5. Performance
Performance optimization strategies.

**Covers**:
- Profiling techniques
- Optimization patterns
- Algorithm improvements
- Memory management
- Scalability patterns

## ⌨️ Commands

### /fix-bugs
Automatically detect and fix bugs.

```bash
/fix-bugs src/
/fix-bugs src/auth --severity critical
```

**What it does**:
1. Scans for bugs
2. Prioritizes by severity
3. Generates fixes
4. Applies safely
5. Validates changes

### /generate-tests
Generate comprehensive test coverage.

```bash
/generate-tests src/utils
/generate-tests src/auth.js 90
```

**What it does**:
1. Analyzes code
2. Identifies test gaps
3. Generates test cases
4. Creates test files
5. Validates coverage

### /optimize-code
Identify and fix performance bottlenecks.

```bash
/optimize-code src/
/optimize-code src/database.js memory
```

**What it does**:
1. Profiles performance
2. Identifies bottlenecks
3. Applies optimizations
4. Measures improvement
5. Validates correctness

### /review-pr
Comprehensive code review.

```bash
/review-pr
/review-pr 42
/review-pr src/auth --focus security
```

**What it does**:
1. Analyzes changes
2. Checks quality
3. Reviews security
4. Assesses performance
5. Provides feedback

## 🎣 Hooks

The plugin includes intelligent hooks for:

- **File Tracking**: Monitor changed files for targeted analysis
- **Context Management**: Track token usage and compaction
- **Metrics Reporting**: Performance and efficiency tracking
- **Session Optimization**: Automatic context management

## 🔌 MCP Integrations

Configure external services via `mcp/opencode.json`:

### GitHub
For PR reviews and code analysis:
```json
{
  "github": {
    "enabled": true,
    "oauth": {
      "scope": "repo read:user"
    }
  }
}
```

### SonarQube
For enterprise code quality analysis:
```json
{
  "sonarqube": {
    "enabled": true,
    "environment": {
      "SONAR_TOKEN": "{env:SONAR_TOKEN}",
      "SONAR_HOST": "{env:SONAR_HOST}"
    }
  }
}
```

### Perplexity
For research capabilities:
```json
{
  "perplexity": {
    "enabled": true,
    "headers": {
      "Authorization": "Bearer {env:PERPLEXITY_API_KEY}"
    }
  }
}
```

## ⚙️ Configuration

Plugin configuration in `opencode.json`:

```json
{
  "config": {
    "tokenEfficiency": {
      "maxContextFiles": 10,
      "useDependencyGraph": true,
      "autoCompactThreshold": 8000
    },
    "performance": {
      "maxFilesToAnalyze": 50,
      "enableCaching": true,
      "cacheExpiryMinutes": 30
    },
    "agents": {
      "architect": {
        "temperature": 0.1,
        "maxTokens": 8000
      },
      "reviewer": {
        "temperature": 0.1,
        "maxTokens": 4000
      }
    }
  }
}
```

## 📊 Efficiency Strategies

### Context Minimization
- Use dependency graphs to include only relevant files
- Set limits on read operations
- Use grep before read to locate specific content
- Leverage glob with specific patterns

### Parallel Agent Execution
- Code review runs parallel with test generation
- Architecture design independent of refactoring
- Bug hunting parallel to performance analysis

### Smart Caching
- Cache dependency graphs
- Store file analysis results
- Remember previous refactoring decisions

### Progressive Disclosure
- Start with high-level analysis
- Drill down only into problematic areas
- Skip analysis for files with no recent changes

### Token Budgeting
```javascript
const TOKEN_LIMITS = {
  architect: 8000,    // Complex designs need more
  reviewer: 4000,     // Focused reviews need less
  testWriter: 6000,   // Medium for test generation
  debugger: 5000,     // Targeted debugging
  refactor: 4000,     // Focused changes
  optimizer: 5000     // Performance analysis
}
```

## 🏗️ Architecture

```
swe-sworm-plugin/
├── src/
│   ├── index.ts              # Plugin entry point
│   ├── tools/                # 5 core tools
│   │   ├── code-analyzer.ts
│   │   ├── dependency-graph.ts
│   │   ├── test-generator.ts
│   │   ├── bug-detector.ts
│   │   └── refactor-engine.ts
│   └── hooks/                # Event hooks (in index.ts)
├── .opencode/
│   ├── agents/               # 6 specialized agents
│   │   ├── code-architect.md
│   │   ├── code-reviewer.md
│   │   ├── bug-hunter.md
│   │   ├── test-writer.md
│   │   ├── refactor-bot.md
│   │   └── perf-optimizer.md
│   ├── commands/             # 4 slash commands
│   │   ├── fix-bugs.md
│   │   ├── generate-tests.md
│   │   ├── optimize-code.md
│   │   └── review-pr.md
│   └── skills/               # 5 knowledge bases
│       ├── code-review/
│       ├── debugging/
│       ├── testing-patterns/
│       ├── refactoring/
│       └── performance/
├── mcp/
│   └── opencode.json         # MCP configuration
├── opencode.json             # Plugin configuration
├── package.json
└── README.md
```

## 🎓 Best Practices

### When to Use Which Agent

- **New Feature** → @code-architect
- **Code Review** → @code-reviewer
- **Bug** → @bug-hunter
- **Missing Tests** → @test-writer
- **Legacy Code** → @refactor-bot
- **Slow Performance** → @perf-optimizer

### Workflow Integration

1. **Before coding**: @code-architect for design
2. **During coding**: @code-reviewer for early feedback
3. **After coding**: @test-writer for coverage
4. **Before merge**: /review-pr for final check
5. **After merge**: /optimize-code for performance

### Token Efficiency Tips

- Start with high-level questions
- Use dependencyGraph to find relevant files
- Set limit parameter on read operations
- Use grep to find specific patterns
- Leverage agents' specialized knowledge

## 🔧 Development

### Building

```bash
npm install
npm run build
```

### Testing

```bash
npm test
```

### Watching

```bash
npm run watch
```

## 🤝 Contributing

Contributions welcome! Areas for improvement:

- Additional language support
- New refactoring patterns
- More bug detection patterns
- Additional MCP integrations
- Performance improvements

## 📄 License

MIT License - see LICENSE file

## 🙏 Acknowledgments

Built for the OpenCode ecosystem to make software engineering more efficient, effective, and enjoyable.

---

**Happy Coding! 🚀**

*The SWE Swarm Plugin - Engineering Excellence Through Intelligent Automation*