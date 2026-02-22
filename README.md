# RLM Analyzer

**AI-powered code analysis using Recursive Language Models**

[![npm version](https://badge.fury.io/js/rlm-analyzer.svg)](https://www.npmjs.com/package/rlm-analyzer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Analyze any codebase with AI that can process **100x beyond context limits**. Powered by **Gemini 3**, **Amazon Bedrock (Nova/Claude/Llama)**, or **Claude (Anthropic API)** and based on MIT CSAIL research on [Recursive Language Models](https://arxiv.org/abs/2512.24601).

## Features

- **Deep Code Analysis** - Understands entire codebases, not just snippets
- **Architecture Analysis** - Maps structure, patterns, and data flow
- **Security Scanning** - Identifies vulnerabilities (OWASP Top 10, auth issues, etc.)
- **Performance Analysis** - Finds bottlenecks and optimization opportunities
- **Refactoring Suggestions** - Identifies code smells and improvements
- **Symbol Search** - Find all usages of functions, classes, variables
- **Custom Questions** - Ask anything about your codebase
- **Multi-Provider Support** - Choose between Gemini (default), Amazon Bedrock (Nova/Claude/Llama), or Claude (Anthropic API)
- **Web Grounding** - Verify package versions with real-time web search (Gemini & Nova Premier)
- **MCP Integration** - Works with Claude Code, Cursor, and other MCP clients
- **Cost Efficient** - Save 60-73% on API costs by offloading to Gemini/Nova
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

## Documentation

- **[How It Works](docs/how-it-works.md)** - Deep dive into RLM architecture, recursive analysis, and token optimization
- **[Models & Commands Reference](docs/models-and-commands.md)** - Complete list of CLI commands, model IDs, and aliases for Gemini, Bedrock, and Claude

## Changelog

**v1.6.1**
- Added full support for Flutter/Dart apps featuring structural indexing, layout analysis, and mobile-aware system prompts.
- Fixed a bug where reference errors during Javascript transpilation were ignored and returned un-interpolated template variables.
- Fixed a bug where the Python-to-JavaScript string extraction mangled markdown templates like `## Headers` during formatting.

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

### 1. Configure Provider Credentials

#### Option A: Google Gemini (Default)

Get a free API key from [Google AI Studio](https://makersuite.google.com/app/apikey), then:

```bash
# Use the config command
rlm config YOUR_GEMINI_API_KEY

# Or set environment variable
export GEMINI_API_KEY=your_api_key

# Or create .env file
echo "GEMINI_API_KEY=your_api_key" > .env
```

#### Option B: Amazon Bedrock

First, install the AWS SDK (required for Bedrock):

```bash
npm install @aws-sdk/client-bedrock-runtime
```

Then configure authentication (choose one):

```bash
# Option 1: Bedrock API Key (Recommended - simplest setup)
# Generate at: AWS Console → Bedrock → API keys
export AWS_BEARER_TOKEN_BEDROCK=your_bedrock_api_key
export AWS_REGION=us-east-1

# Option 2: AWS Access Keys
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=us-east-1

# Option 3: AWS CLI profile
aws configure
```

#### Option C: Claude (Anthropic API)

Get your API key from [Anthropic Console](https://console.anthropic.com/), then:

```bash
export ANTHROPIC_API_KEY=your_api_key
```

### 2. Analyze Your Code

```bash
# Get a codebase summary (uses Gemini by default)
rlm summary

# Use Amazon Bedrock instead
rlm summary --provider bedrock

# Use Claude (Anthropic API) instead
rlm summary --provider claude

# Analyze architecture
rlm arch

# Security analysis with web grounding
rlm security --grounding

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
| `--provider, -p <name>` | LLM provider: `gemini` (default), `bedrock`, or `claude` |
| `--grounding` | Enable web grounding for security analysis |
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

# Use Amazon Bedrock with Nova Pro
rlm summary --provider bedrock --model smart

# Use Bedrock with Claude (via AWS)
rlm arch --provider bedrock --model claude-sonnet

# Use Claude directly (Anthropic API)
rlm arch --provider claude --model sonnet

# Find all usages of a function
rlm find "handleSubmit"

# Explain a specific file
rlm explain src/auth/login.ts

# Ask about the codebase
rlm ask "What design patterns are used in this codebase?"

# Security analysis with web grounding (verifies package versions)
rlm security --grounding

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

#### Using Gemini (Default)

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

#### Using Amazon Bedrock

First, install the AWS SDK in your project or globally:

```bash
npm install @aws-sdk/client-bedrock-runtime
```

Then configure the MCP server (choose one authentication method):

**Option 1: Bedrock API Key (Recommended)**

```json
{
  "mcpServers": {
    "rlm-analyzer": {
      "command": "npx",
      "args": ["-y", "rlm-analyzer-mcp"],
      "env": {
        "RLM_PROVIDER": "bedrock",
        "AWS_BEARER_TOKEN_BEDROCK": "your_bedrock_api_key",
        "AWS_REGION": "us-east-1"
      }
    }
  }
}
```

**Option 2: AWS Access Keys**

```json
{
  "mcpServers": {
    "rlm-analyzer": {
      "command": "npx",
      "args": ["-y", "rlm-analyzer-mcp"],
      "env": {
        "RLM_PROVIDER": "bedrock",
        "AWS_ACCESS_KEY_ID": "your_access_key",
        "AWS_SECRET_ACCESS_KEY": "your_secret_key",
        "AWS_REGION": "us-east-1"
      }
    }
  }
}
```

**Option 3: AWS Profile**

```json
{
  "mcpServers": {
    "rlm-analyzer": {
      "command": "npx",
      "args": ["-y", "rlm-analyzer-mcp"],
      "env": {
        "RLM_PROVIDER": "bedrock",
        "AWS_PROFILE": "your_profile_name",
        "AWS_REGION": "us-east-1"
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

// Analyze architecture (uses default provider - Gemini)
const result = await analyzeArchitecture('/path/to/project');
console.log(result.answer);

// Security analysis with Bedrock
const security = await analyzeSecurity('/path/to/project', { provider: 'bedrock' });
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
  model: 'smart', // Uses provider-specific alias
  provider: 'bedrock', // Use Amazon Bedrock
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

#### Gemini Models (Default Provider)

| Alias | Model ID | Description |
|-------|----------|-------------|
| `fast`, `default` | `gemini-3-flash-preview` | Fast and efficient (recommended) |
| `smart`, `pro` | `gemini-3-pro-preview` | Most capable |

#### Amazon Bedrock Models

| Alias | Model ID | Description |
|-------|----------|-------------|
| `fast`, `default` | `us.amazon.nova-2-lite-v1:0` | Nova 2 Lite (default) |
| `smart` | `us.anthropic.claude-sonnet-4-5-*` | Claude 4.5 Sonnet |
| `claude-sonnet` | `us.anthropic.claude-sonnet-4-5-*` | Claude 4.5 Sonnet |
| `claude-opus` | `us.anthropic.claude-opus-4-5-*` | Claude 4.5 Opus |
| `qwen3-coder` | `qwen.qwen3-coder-30b-*` | Qwen3 Coder - Best for coding |
| `gpt-oss` | `openai.gpt-oss-120b-*` | OpenAI GPT OSS |
| `llama-4` | `us.meta.llama4-maverick-*` | Llama 4 |

> **[See all models and aliases →](docs/models-and-commands.md)**

### Configuration Priority

Model selection follows this priority order:

1. **CLI `--model` flag** (highest priority)
2. **Environment variables**: `RLM_DEFAULT_MODEL`, `RLM_FALLBACK_MODEL`
3. **Config file**: `~/.rlm-analyzer/config.json`
4. **Built-in defaults**: `gemini-3-flash-preview` (Gemini) or `amazon.nova-lite-v1:0` (Bedrock)

### Using Model Aliases

```bash
# Use fast model (gemini-3-flash-preview)
rlm summary --model fast

# Use smart model (gemini-3-pro-preview)
rlm arch --model smart

# Use Bedrock with Nova Pro
rlm summary --provider bedrock --model smart

# Use Bedrock with Claude Sonnet
rlm arch --provider bedrock --model claude-sonnet
```

### Environment Variables

```bash
# Set default provider (gemini or bedrock)
export RLM_PROVIDER=gemini

# Set default model
export RLM_DEFAULT_MODEL=gemini-3-pro-preview

# Set fallback model
export RLM_FALLBACK_MODEL=gemini-2.0-flash-exp

# Gemini API key
export GEMINI_API_KEY=your_api_key

# Bedrock authentication (choose one):
# Option 1: Bedrock API Key (recommended)
export AWS_BEARER_TOKEN_BEDROCK=your_bedrock_api_key
export AWS_REGION=us-east-1

# Option 2: AWS Access Keys
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=us-east-1

# Option 3: AWS Profile
export AWS_PROFILE=your_profile_name
export AWS_REGION=us-east-1
```

### Config File

Create `~/.rlm-analyzer/config.json`:

```json
{
  "apiKey": "your_gemini_api_key",
  "provider": "gemini",
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

### Credentials Storage

#### Gemini Credentials

Your API key can be stored in multiple locations (checked in order):

1. `GEMINI_API_KEY` environment variable
2. `RLM_API_KEY` environment variable
3. `.env` file in current directory
4. `.env.local` file in current directory
5. `~/.rlm-analyzer/config.json`
6. `~/.config/rlm-analyzer/config.json`

#### Bedrock Credentials

Authentication options (in priority order):

1. **Bedrock API Key** (Recommended): `AWS_BEARER_TOKEN_BEDROCK` environment variable
   - Generate at: AWS Console → Bedrock → API keys
   - Simplest setup, no IAM configuration required
2. **AWS Access Keys**: `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`
3. **AWS Profile**: `AWS_PROFILE` or `~/.aws/credentials`
4. **IAM Role**: Automatic when running on AWS infrastructure

The region can be set via `AWS_REGION` environment variable (default: `us-east-1`).

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

RLM Analyzer uses Recursive Language Models (RLMs) to analyze codebases that exceed traditional context limits.

```
┌─────────────────────────────────────────────────────────────┐
│                      User Query                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator (Main LLM)                   │
│  • Sees file tree, decides which files to read              │
│  • Spawns Sub-LLMs for deep analysis                        │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Sub-LLM  │   │ Sub-LLM  │   │ Sub-LLM  │
        └──────────┘   └──────────┘   └──────────┘
              │               │               │
              └───────────────┼───────────────┘
                              ▼
                        Final Answer
```

### Key Concepts

1. **Recursive Analysis** - Main LLM spawns sub-LLMs to analyze files in parallel
2. **Context Optimization** - Shows file tree first, LLM requests only needed files
3. **Multi-turn Conversation** - Multiple turns to read, analyze, and refine
4. **Memory Bank** - Tracks findings to prevent "context rot"
5. **Adaptive Compression** - Compresses older context as usage increases

This enables analysis of codebases **100x larger** than traditional context windows.

> **[Read the full technical deep-dive →](docs/how-it-works.md)**

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

### "API key not configured" (Gemini)

```bash
# Check if key is set
rlm config

# Set your key
rlm config YOUR_API_KEY
```

### "AWS credentials not configured" (Bedrock)

```bash
# Check credentials
rlm config

# Option 1: Set environment variables
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_REGION=us-east-1

# Option 2: Use AWS CLI to configure
aws configure
```

### "Amazon Bedrock provider requires @aws-sdk/client-bedrock-runtime"

The AWS SDK is an optional dependency. Install it to use Bedrock:

```bash
npm install @aws-sdk/client-bedrock-runtime
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
- Use `--model fast` for faster analysis

### Execution errors in verbose mode

Some codebases trigger security filters (e.g., files containing `process.env`). The analysis will still complete but may take more turns.

### MCP server not connecting

1. Verify the command works: `npx rlm-analyzer-mcp`
2. Check credentials are set in the MCP config (Gemini API key or AWS credentials)
3. Restart your MCP client (Claude Code, Cursor)

### Bedrock throttling errors

If you see throttling errors with Bedrock, try:
- Using a smaller model (`--model fast`)
- Reducing concurrent requests
- Requesting higher limits from AWS

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

  // Provider types
  ProviderName,       // 'gemini' | 'bedrock'
  LLMProvider,        // Provider interface
  Message,            // Conversation message
  GenerateOptions,    // Generation options
  GenerateResponse,   // Generation response

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
