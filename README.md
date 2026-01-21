# RLM Analyzer

**AI-powered code analysis using Recursive Language Models**

[![npm version](https://badge.fury.io/js/rlm-analyzer.svg)](https://www.npmjs.com/package/rlm-analyzer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Analyze any codebase with AI that can process **100x beyond context limits**. Powered by **Gemini 3** and based on MIT CSAIL research on [Recursive Language Models](https://arxiv.org/abs/2512.24601).

## Features

- **Deep Code Analysis** - Understands entire codebases, not just snippets
- **Architecture Analysis** - Maps structure, patterns, and data flow
- **Security Scanning** - Identifies vulnerabilities (OWASP Top 10, auth issues, etc.)
- **Performance Analysis** - Finds bottlenecks and optimization opportunities
- **Refactoring Suggestions** - Identifies code smells and improvements
- **Symbol Search** - Find all usages of functions, classes, variables
- **Custom Questions** - Ask anything about your codebase
- **MCP Integration** - Works with Claude Code, Cursor, and other MCP clients
- **Cost Efficient** - Save 60-73% on API costs by offloading to Gemini
- **Token Optimization** - Context compression saves additional 50-70%

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
- [MCP Server Integration](#mcp-server-integration)
- [Programmatic API](#programmatic-api)
- [Model Configuration](#model-configuration)
- [Advanced Features](#advanced-features)
- [Configuration](#configuration)
- [How It Works](#how-it-works)
- [Cost Savings](#cost-savings-with-mcp-integration)
- [Troubleshooting](#troubleshooting)

---

## Installation

### Global Installation (Recommended for CLI)

```bash
npm install -g rlm-analyzer
```

### Local Installation (For programmatic use)

```bash
npm install rlm-analyzer
```

### npx (No installation required)

```bash
npx rlm-analyzer summary
```

---

## Quick Start

### 1. Configure API Key

Get a free API key from [Google AI Studio](https://makersuite.google.com/app/apikey), then:

```bash
# Option 1: Use the config command
rlm config YOUR_GEMINI_API_KEY

# Option 2: Set environment variable
export GEMINI_API_KEY=your_api_key

# Option 3: Create .env file in your project
echo "GEMINI_API_KEY=your_api_key" > .env
```

### 2. Analyze Your Code

```bash
# Get a codebase summary
rlm summary

# Analyze architecture
rlm arch

# Security analysis
rlm security

# Ask a question
rlm ask "How does authentication work?"
```

---

## CLI Reference

### Commands

| Command | Description |
|---------|-------------|
| `rlm summary` | Get a comprehensive codebase summary |
| `rlm arch` | Analyze architecture and structure |
| `rlm deps` | Analyze dependencies and imports |
| `rlm security` | Security vulnerability analysis |
| `rlm perf` | Performance analysis |
| `rlm refactor` | Find refactoring opportunities |
| `rlm find <symbol>` | Find all usages of a symbol |
| `rlm explain <file>` | Explain a specific file |
| `rlm ask "<question>"` | Ask a custom question |
| `rlm config [key]` | Configure or check API key |
| `rlm test` | Test API connection and model availability |

### Options

| Option | Description |
|--------|-------------|
| `--dir, -d <path>` | Directory to analyze (default: current) |
| `--model, -m <name>` | Model to use (see [Model Configuration](#model-configuration)) |
| `--output, -o <file>` | Save results to a markdown file |
| `--verbose, -v` | Show detailed turn-by-turn output |
| `--json` | Output results as JSON |
| `--help, -h` | Show help |

### Examples

```bash
# Analyze a specific directory
rlm arch --dir /path/to/project

# Use a specific model
rlm summary --model smart

# Find all usages of a function
rlm find "handleSubmit"

# Explain a specific file
rlm explain src/auth/login.ts

# Ask about the codebase
rlm ask "What design patterns are used in this codebase?"

# Get JSON output for scripting
rlm summary --json > analysis.json

# Save analysis to a markdown file
rlm summary -o rlm-context.md

# Verbose mode to see sub-LLM calls and compression
rlm security -v
```

---

## MCP Server Integration

RLM Analyzer includes an MCP (Model Context Protocol) server for integration with AI coding assistants like Claude Code and Cursor.

### Setup with Claude Code

Add to your Claude Code configuration (`~/.claude.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "rlm-analyzer": {
      "command": "npx",
      "args": ["-y", "rlm-analyzer-mcp"],
      "env": {
        "GEMINI_API_KEY": "your_api_key"
      }
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `rlm_analyze` | General codebase analysis with custom queries |
| `rlm_summarize` | Get comprehensive codebase summary |
| `rlm_architecture` | Analyze architecture and structure |
| `rlm_security` | Security vulnerability analysis |
| `rlm_dependencies` | Analyze dependencies and coupling |
| `rlm_refactor` | Find refactoring opportunities |
| `rlm_ask` | Ask specific questions about the codebase |
| `rlm_config` | Get current configuration status |

### Example MCP Usage

Once configured, you can use these tools in Claude Code:

```
Analyze the security of /path/to/project using rlm_security
```

---

## Programmatic API

### Basic Usage

```typescript
import {
  analyzeCodebase,
  analyzeArchitecture,
  analyzeSecurity,
  analyzeDependencies,
  analyzeRefactoring,
  summarizeCodebase,
  askQuestion,
  loadFiles,
} from 'rlm-analyzer';

// Analyze architecture
const result = await analyzeArchitecture('/path/to/project');
console.log(result.answer);

// Security analysis
const security = await analyzeSecurity('/path/to/project');
console.log(security.answer);

// Ask a custom question
const answer = await askQuestion(
  '/path/to/project',
  'How does the authentication system work?'
);
console.log(answer.answer);

// Full analysis with options
const full = await analyzeCodebase({
  directory: '/path/to/project',
  query: 'Explain the data flow',
  analysisType: 'custom',
  model: 'gemini-3-pro-preview',
  verbose: true,
});
```

### Factory Functions

```typescript
import { createAnalyzer, createOrchestrator, getModelConfig } from 'rlm-analyzer';

// Create a pre-configured analyzer
const analyzer = createAnalyzer({ model: 'fast', verbose: true });
const result = await analyzer.analyze('/path/to/project', {
  query: 'What are the main components?',
});

// Access the underlying orchestrator
const orchestrator = analyzer.orchestrator;

// Get current model configuration
const config = getModelConfig();
console.log(`Using model: ${config.defaultModel}`);
```

### Low-Level Orchestrator API

```typescript
import { RLMOrchestrator, loadFiles, getDefaultRLMConfig } from 'rlm-analyzer';

// Create orchestrator with custom config
const config = getDefaultRLMConfig('gemini-3-flash-preview');
config.maxTurns = 15;

const orchestrator = new RLMOrchestrator(config, true);

// Load files manually
const files = await loadFiles('/path/to/project');

// Process query
const result = await orchestrator.processQuery(
  'Analyze the architecture',
  { files, variables: {}, mode: 'code-analysis' }
);

console.log(result.answer);
console.log(`Turns: ${result.turns}, Sub-LLM calls: ${result.subLLMCalls}`);
```

### Advanced Features API

```typescript
import {
  // Parallel execution
  ParallelExecutor,

  // Adaptive compression
  AdaptiveCompressor,

  // Context management
  ContextManager,
  ContextRotDetector,

  // Selective attention
  SelectiveAttention,

  // Iterative refinement
  IterativeRefiner,
} from 'rlm-analyzer';

// Parallel sub-LLM execution
const parallel = new ParallelExecutor({ maxConcurrent: 5 });
const results = await parallel.executeBatch(
  [
    { id: 'auth', query: 'Analyze authentication' },
    { id: 'api', query: 'Analyze API structure' },
  ],
  async (query) => await llmCall(query)
);

// Adaptive compression based on context usage
const compressor = new AdaptiveCompressor({ maxContextTokens: 100000 });
compressor.updateUsage(50000); // 50% used
const level = compressor.getCompressionLevel(); // 'normal'
const compressed = compressor.compressAdaptively(longText, 2000);

// Context rot detection
const detector = new ContextRotDetector();
const indicators = detector.analyzeResponse(modelResponse);
if (indicators.needsMemoryInjection) {
  const injection = detector.generateMemoryInjection(memoryBank);
}

// Selective attention for memory filtering
const attention = new SelectiveAttention();
attention.setQueryContext('security vulnerabilities');
const relevantMemories = attention.filterByAttention(memories, 10);
```

---

## Model Configuration

### Available Models

| Model ID | Alias | Description |
|----------|-------|-------------|
| `gemini-3-flash-preview` | `fast`, `flash`, `default` | Fast and efficient (recommended) |
| `gemini-3-pro-preview` | `smart`, `pro` | Most capable |
| `gemini-2.5-flash` | `flash-2.5` | Stable release |
| `gemini-2.0-flash-exp` | `flash-2` | Fallback option |

### Configuration Priority

Model selection follows this priority order:

1. **CLI `--model` flag** (highest priority)
2. **Environment variables**: `RLM_DEFAULT_MODEL`, `RLM_FALLBACK_MODEL`
3. **Config file**: `~/.rlm-analyzer/config.json`
4. **Built-in defaults**: `gemini-3-flash-preview`

### Using Model Aliases

```bash
# Use fast model (gemini-3-flash-preview)
rlm summary --model fast

# Use smart model (gemini-3-pro-preview)
rlm arch --model smart
```

### Environment Variables

```bash
# Set default model
export RLM_DEFAULT_MODEL=gemini-3-pro-preview

# Set fallback model
export RLM_FALLBACK_MODEL=gemini-2.0-flash-exp
```

### Config File

Create `~/.rlm-analyzer/config.json`:

```json
{
  "apiKey": "your_api_key",
  "models": {
    "default": "gemini-3-flash-preview",
    "fallback": "gemini-2.0-flash-exp"
  }
}
```

---

## Advanced Features

RLM Analyzer implements cutting-edge techniques from the [RLM paper](https://arxiv.org/abs/2512.24601) for efficient token usage:

### Context Compression (50-70% savings)

Automatically compresses sub-LLM results by extracting key information:

```
[Sub-LLM] Analyzing authentication...
[Context] Compressed: 67% savings (level: normal)
```

### Sliding Window History

Keeps recent turns in full detail while compressing older context:

```
[Context] History optimized: 15 → 8 messages
```

### Memory Bank

Extracts and stores key findings for later synthesis:

- File analysis results
- Identified patterns
- Detected issues
- Dependencies

### Adaptive Compression

Compression level adjusts based on context usage:

| Context Usage | Compression Level |
|---------------|-------------------|
| < 50% | `none` |
| 50-70% | `normal` |
| 70-85% | `aggressive` |
| > 85% | `emergency` |

### Context Rot Detection

Detects when the model loses track of context and injects memory reminders.

### Parallel Sub-Agent Execution

Runs multiple sub-LLM queries concurrently for faster analysis.

### Iterative Refinement (opt-in)

Multi-pass analysis for quality improvement on complex queries.

---

## Configuration

### API Key Storage

Your API key can be stored in multiple locations (checked in order):

1. `GEMINI_API_KEY` environment variable
2. `RLM_API_KEY` environment variable
3. `.env` file in current directory
4. `.env.local` file in current directory
5. `~/.rlm-analyzer/config.json`
6. `~/.config/rlm-analyzer/config.json`

### File Filtering

Default file extensions analyzed:

```
.ts, .tsx, .js, .jsx, .py, .java, .go, .rs, .c, .cpp, .h,
.cs, .rb, .php, .swift, .kt, .scala, .vue, .svelte, .md, .json
```

Default directories excluded:

```
node_modules, .git, dist, build, .next, __pycache__, vendor,
target, .idea, .vscode, coverage, .nyc_output
```

### Supported Languages

- TypeScript / JavaScript / JSX / TSX
- Python
- Java / Kotlin / Scala
- Go
- Rust
- C / C++ / C#
- Ruby
- PHP
- Swift
- Vue / Svelte
- And more...

---

## How It Works

RLM Analyzer uses Recursive Language Models (RLMs) to analyze codebases that exceed traditional context limits:

```
┌─────────────────────────────────────────────────────────────┐
│                      RLM Orchestrator                       │
├─────────────────────────────────────────────────────────────┤
│  1. File Loading      Load codebase into virtual env        │
│  2. REPL Execution    AI writes code to explore files       │
│  3. Sub-LLM Calls     Delegate analysis to specialized      │
│                       sub-queries (llm_query)               │
│  4. Context Mgmt      Compress, optimize, detect rot        │
│  5. Synthesis         Combine findings into final answer    │
└─────────────────────────────────────────────────────────────┘
```

### The RLM Approach

1. **File Loading** - Loads your codebase into a virtual file index
2. **REPL Execution** - AI writes and executes Python-like code to explore files
3. **Sub-LLM Calls** - Complex analysis delegated via `llm_query()` function
4. **Context Management** - Compression, sliding window, memory bank
5. **Iterative Refinement** - Multiple turns until `FINAL()` is called
6. **Final Answer** - Synthesized analysis based on deep exploration

This enables analysis of codebases **100x larger** than traditional context windows.

---

## Cost Savings with MCP Integration

When used as an MCP tool with Claude Code or Cursor, RLM Analyzer significantly reduces costs by offloading expensive analysis to Gemini's more affordable API.

### Pricing Comparison (Jan 2026)

| Model | Input/MTok | Output/MTok |
|-------|------------|-------------|
| Claude Sonnet 4.5 | $3.00 | $15.00 |
| Gemini 3 Flash | $0.50 | $3.00 |
| Gemini 2.0 Flash | $0.10 | $0.40 |

*Gemini is 6-30x cheaper per token than Claude.*

### Real-World Cost Example

**Analyzing a 100-file codebase (~500KB, ~125K tokens):**

| Approach | Calculation | Total Cost |
|----------|-------------|------------|
| **Claude Only** | 125K input × $3 + 3K output × $15 | **$0.42** |
| **Claude + RLM** | Claude: $0.05 + Gemini: $0.12 | **$0.17** |

**Savings: ~60%** on typical analysis tasks.

### Larger Codebases (500+ files)

| Codebase Size | Claude Only | With RLM | Savings |
|---------------|-------------|----------|---------|
| 100 files (~125K tokens) | $0.42 | $0.17 | 60% |
| 500 files (~500K tokens) | $1.58 | $0.44 | 72% |
| 1000 files (~1M tokens) | $3.15 | $0.85 | 73% |

### Why It Works

1. **Claude receives only summaries** - A few thousand tokens vs. entire codebase
2. **Gemini handles heavy processing** - File reading, sub-LLM calls, synthesis
3. **RLM compression** - Additional 50-70% token savings within Gemini
4. **Free tier available** - Gemini offers 250K tokens/min free for small projects

### Additional Savings Options

- **Gemini Batch API**: 50% discount for non-urgent analysis
- **Prompt Caching**: Up to 90% savings on repeated patterns
- **Use faster models**: `--model fast` uses Gemini Flash for maximum savings

---

## Security

- **API keys** are never logged or transmitted except to the Gemini API
- **Code execution** happens in a sandboxed environment
- **Dangerous operations** (eval, file writes, network calls) are blocked
- **All analysis** is read-only - no modifications to your code
- **Pattern blocking** prevents execution of potentially harmful code

---

## Troubleshooting

### "API key not configured"

```bash
# Check if key is set
rlm config

# Set your key
rlm config YOUR_API_KEY
```

### "No files found to analyze"

Make sure you're in a directory with code files, or specify a directory:

```bash
rlm summary --dir /path/to/code
```

### Analysis is slow

- Large codebases take longer (100+ files = more sub-LLM calls)
- Use `--verbose` to see progress and token savings
- Consider analyzing specific subdirectories

### Execution errors in verbose mode

Some codebases trigger security filters (e.g., files containing `process.env`). The analysis will still complete but may take more turns.

### MCP server not connecting

1. Verify the command works: `npx rlm-analyzer-mcp`
2. Check API key is set in the MCP config
3. Restart your MCP client (Claude Code, Cursor)

---

## TypeScript Types

All types are exported for TypeScript users:

```typescript
import type {
  // Core types
  RLMConfig,
  RLMResult,
  CodeAnalysisOptions,
  CodeAnalysisResult,
  AnalysisType,

  // Context management
  MemoryEntry,
  CompressedTurn,
  ContextManagerConfig,

  // Advanced features
  ParallelExecutionConfig,
  ParallelBatchResult,
  AdaptiveCompressionConfig,
  ContextUsageMetrics,
  ContextRotIndicators,
  AttentionWeights,
  RefinementConfig,
  RefinementPassResult,

  // Model configuration
  ModelConfigOptions,
  ResolvedModelConfig,
} from 'rlm-analyzer';
```

---

## License

MIT

---

## Credits

Based on research from MIT CSAIL:
- [Recursive Language Models: A Paradigm for Processing Arbitrarily Long Inputs](https://arxiv.org/abs/2512.24601) (arXiv:2512.24601)

---

## Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

## Support

- **Issues**: [GitHub Issues](https://github.com/zendizmo/rlm-analyzer/issues)
- **Discussions**: [GitHub Discussions](https://github.com/zendizmo/rlm-analyzer/discussions)
