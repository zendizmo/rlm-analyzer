# Models and Commands Reference

## CLI Commands

| Command | Description | Example |
|---------|-------------|---------|
| `rlm summary` | Get a comprehensive codebase summary | `rlm summary ./my-project` |
| `rlm arch` | Analyze architecture and structure | `rlm arch --provider bedrock` |
| `rlm deps` | Analyze dependencies and imports | `rlm deps` |
| `rlm security` | Security vulnerability analysis | `rlm security --grounding` |
| `rlm perf` | Performance analysis | `rlm perf` |
| `rlm refactor` | Find refactoring opportunities | `rlm refactor` |
| `rlm find <symbol>` | Find all usages of a symbol | `rlm find "handleSubmit"` |
| `rlm explain <file>` | Explain a specific file | `rlm explain src/auth/login.ts` |
| `rlm ask "<question>"` | Ask a custom question | `rlm ask "How does auth work?"` |
| `rlm config [key]` | Configure or check API key | `rlm config YOUR_API_KEY` |
| `rlm test` | Test API connection | `rlm test --provider claude` |

## CLI Options

| Option | Description |
|--------|-------------|
| `--dir, -d <path>` | Directory to analyze (default: current) |
| `--model, -m <name>` | Model to use (alias or full ID) |
| `--provider, -p <name>` | Provider: `gemini` (default), `bedrock`, or `claude` |
| `--grounding, -g` | Enable web grounding (security only) |
| `--output, -o <file>` | Save results to markdown file |
| `--verbose, -v` | Show detailed turn-by-turn output |
| `--json` | Output results as JSON |
| `--help, -h` | Show help |
| `--version, -V` | Show version |

---

## Gemini Models (Default Provider)

### Model Aliases

| Alias | Model ID | Description |
|-------|----------|-------------|
| `fast` | `gemini-3-flash-preview` | Fast and efficient (default) |
| `smart` | `gemini-3-pro-preview` | Most capable |
| `default` | `gemini-3-flash-preview` | Same as fast |
| `pro` | `gemini-3-pro-preview` | Same as smart |
| `flash` | `gemini-3-flash-preview` | Same as fast |
| `flash-2` | `gemini-2.0-flash-exp` | Older Flash version |
| `flash-2.5` | `gemini-2.5-flash` | Stable release |

### Usage

```bash
# Default (Gemini Flash)
rlm summary

# Use smart model
rlm arch --model smart

# Use specific model ID
rlm security --model gemini-3-pro-preview
```

---

## Amazon Bedrock Models

> **Note**: Bedrock requires `@aws-sdk/client-bedrock-runtime`. Install with:
> ```bash
> npm install @aws-sdk/client-bedrock-runtime
> ```

### Model Aliases

#### Convenience Aliases

| Alias | Model ID | Description |
|-------|----------|-------------|
| `fast` | `us.amazon.nova-2-lite-v1:0` | Nova 2 Lite (default) |
| `smart` | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | Claude 4.5 Sonnet |
| `default` | `us.amazon.nova-2-lite-v1:0` | Same as fast |
| `grounding` | `us.amazon.nova-2-lite-v1:0` | Web grounding support |

#### Claude Models (Anthropic)

| Alias | Model ID | Notes |
|-------|----------|-------|
| `claude-sonnet` | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | Claude 4.5 Sonnet - Latest |
| `claude-opus` | `us.anthropic.claude-opus-4-5-20251101-v1:0` | Claude 4.5 Opus - Most capable |
| `claude-haiku` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Claude 4.5 Haiku - Fast |
| `claude-4.5-sonnet` | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | Same as claude-sonnet |
| `claude-4.5-opus` | `us.anthropic.claude-opus-4-5-20251101-v1:0` | Same as claude-opus |
| `claude-4.5-haiku` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Same as claude-haiku |
| `claude-4-sonnet` | `us.anthropic.claude-sonnet-4-20250514-v1:0` | Claude 4 Sonnet |
| `claude-4.1-opus` | `us.anthropic.claude-opus-4-1-20250805-v1:0` | Claude 4.1 Opus |
| `claude-3.5-haiku` | `us.anthropic.claude-3-5-haiku-20241022-v1:0` | Claude 3.5 Haiku |
| `claude-3-haiku` | `anthropic.claude-3-haiku-20240307-v1:0` | Claude 3 Haiku (on-demand) |

#### Amazon Nova Models

| Alias | Model ID | Notes |
|-------|----------|-------|
| `nova-2-lite` | `us.amazon.nova-2-lite-v1:0` | Nova 2 Lite - Default |
| `nova-micro` | `amazon.nova-micro-v1:0` | Ultra fast (on-demand) |
| `nova-lite` | `amazon.nova-lite-v1:0` | Fast (on-demand) |
| `nova-pro` | `amazon.nova-pro-v1:0` | Balanced (on-demand) |
| `nova-premier` | `amazon.nova-premier-v1:0` | Web grounding |
| `nova-sonic` | `us.amazon.nova-sonic-v1:0` | Audio model |
| `nova-2-sonic` | `us.amazon.nova-2-sonic-v1:0` | Nova 2 audio |

#### Meta Llama Models

| Alias | Model ID | Notes |
|-------|----------|-------|
| `llama-4` | `us.meta.llama4-maverick-17b-instruct-v1:0` | Llama 4 Maverick |
| `llama-4-maverick` | `us.meta.llama4-maverick-17b-instruct-v1:0` | Same as llama-4 |
| `llama-4-scout` | `us.meta.llama4-scout-17b-instruct-v1:0` | Llama 4 Scout |
| `llama-3.3` | `meta.llama3-3-70b-instruct-v1:0` | Llama 3.3 70B (on-demand) |
| `llama-3.2-90b` | `meta.llama3-2-90b-instruct-v1:0` | Llama 3.2 90B |
| `llama-3.1-405b` | `meta.llama3-1-405b-instruct-v1:0` | Llama 3.1 405B - Largest |
| `llama-3.1-70b` | `meta.llama3-1-70b-instruct-v1:0` | Llama 3.1 70B |

#### Qwen Models (Alibaba)

| Alias | Model ID | Notes |
|-------|----------|-------|
| `qwen3-coder` | `qwen.qwen3-coder-30b-a3b-v1:0` | Best for coding |
| `qwen3-coder-30b` | `qwen.qwen3-coder-30b-a3b-v1:0` | Same as qwen3-coder |
| `qwen3` | `qwen.qwen3-235b-a22b-2507-v1:0` | General purpose |
| `qwen3-235b` | `qwen.qwen3-235b-a22b-2507-v1:0` | Same as qwen3 |
| `qwen3-32b` | `qwen.qwen3-32b-v1:0` | Smaller, faster |
| `qwen3-vl` | `qwen.qwen3-vl-235b-a22b` | Vision model |
| `qwen3-next` | `qwen.qwen3-next-80b-a3b` | Next generation |

#### OpenAI GPT Models (Open Source)

| Alias | Model ID | Notes |
|-------|----------|-------|
| `gpt-oss` | `openai.gpt-oss-120b-1:0` | GPT OSS 120B |
| `gpt-oss-120b` | `openai.gpt-oss-120b-1:0` | Same as gpt-oss |
| `gpt-oss-20b` | `openai.gpt-oss-20b-1:0` | GPT OSS 20B - Fast |

#### Mistral Models

| Alias | Model ID | Notes |
|-------|----------|-------|
| `mistral-large` | `mistral.mistral-large-2407-v1:0` | Mistral Large (on-demand) |
| `mistral-large-3` | `us.mistral.mistral-large-3-675b-instruct` | Mistral Large 3 |
| `magistral-small` | `us.mistral.magistral-small-2509` | Magistral Small |
| `pixtral-large` | `us.mistral.pixtral-large-2502-v1:0` | Vision model |

### On-Demand vs Inference Profile

Some models require **inference profiles** (prefixed with `us.`), while others support **on-demand** invocation (no prefix):

| Type | Prefix | Examples |
|------|--------|----------|
| On-demand | None | `amazon.nova-lite-v1:0`, `anthropic.claude-3-haiku-*` |
| Inference Profile | `us.` | `us.anthropic.claude-sonnet-4-5-*`, `us.amazon.nova-2-lite-*` |

The aliases automatically use the correct format.

---

## Claude Models (Anthropic Direct API)

> **Note**: Claude provider uses the Anthropic API directly (not via Bedrock).
> Requires `ANTHROPIC_API_KEY` environment variable.

### Model Aliases

#### Convenience Aliases

| Alias | Model ID | Description |
|-------|----------|-------------|
| `fast` | `claude-haiku-4-5-20251001` | Claude 4.5 Haiku - Fast |
| `smart` | `claude-sonnet-4-5-20250929` | Claude 4.5 Sonnet (default) |
| `default` | `claude-sonnet-4-5-20250929` | Same as smart |

#### Claude 4.5 (Latest Generation)

| Alias | Model ID | Notes |
|-------|----------|-------|
| `sonnet` | `claude-sonnet-4-5-20250929` | Balanced - Default |
| `opus` | `claude-opus-4-5-20251101` | Most capable |
| `haiku` | `claude-haiku-4-5-20251001` | Fast |
| `claude-sonnet` | `claude-sonnet-4-5-20250929` | Same as sonnet |
| `claude-opus` | `claude-opus-4-5-20251101` | Same as opus |
| `claude-haiku` | `claude-haiku-4-5-20251001` | Same as haiku |
| `claude-4.5-sonnet` | `claude-sonnet-4-5-20250929` | Full version name |
| `claude-4.5-opus` | `claude-opus-4-5-20251101` | Full version name |
| `claude-4.5-haiku` | `claude-haiku-4-5-20251001` | Full version name |

#### Claude 4.x

| Alias | Model ID | Notes |
|-------|----------|-------|
| `claude-4-sonnet` | `claude-sonnet-4-20250514` | Claude 4 Sonnet |
| `claude-4.1-opus` | `claude-opus-4-1-20250805` | Claude 4.1 Opus |

#### Claude 3.5

| Alias | Model ID | Notes |
|-------|----------|-------|
| `claude-3.5-sonnet` | `claude-3-5-sonnet-20241022` | Claude 3.5 Sonnet |
| `claude-3.5-haiku` | `claude-3-5-haiku-20241022` | Claude 3.5 Haiku |

#### Claude 3

| Alias | Model ID | Notes |
|-------|----------|-------|
| `claude-3-opus` | `claude-3-opus-20240229` | Claude 3 Opus |
| `claude-3-sonnet` | `claude-3-sonnet-20240229` | Claude 3 Sonnet |
| `claude-3-haiku` | `claude-3-haiku-20240307` | Claude 3 Haiku |

---

## Usage Examples

### Gemini (Default)

```bash
# Summary with default model
rlm summary

# Architecture with smart model
rlm arch --model smart

# Security with web grounding
rlm security --grounding
```

### Amazon Bedrock

```bash
# Summary with default (Nova 2 Lite)
rlm summary --provider bedrock

# Architecture with Claude 4.5 Sonnet
rlm arch --provider bedrock --model claude-sonnet

# Security with Qwen Coder
rlm security --provider bedrock --model qwen3-coder

# Ask question with GPT OSS
rlm ask "How does auth work?" --provider bedrock --model gpt-oss

# Use Llama 4
rlm summary --provider bedrock --model llama-4
```

### Claude (Anthropic)

```bash
# Summary with default model (Claude 4.5 Sonnet)
rlm summary --provider claude

# Architecture with Claude Opus
rlm arch --provider claude --model opus

# Ask question with Claude Haiku (fast)
rlm ask "How does auth work?" --provider claude --model haiku
```

### With Options

```bash
# Analyze specific directory
rlm summary --provider bedrock --dir /path/to/project

# Save output to file
rlm arch --provider claude -o architecture.md

# Verbose mode
rlm security --provider bedrock -v

# JSON output
rlm summary --provider claude --json > analysis.json
```

---

## Environment Variables

### Gemini

```bash
export GEMINI_API_KEY=your_api_key
# Or
export RLM_API_KEY=your_api_key
```

### Bedrock

```bash
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

### Claude

```bash
export ANTHROPIC_API_KEY=your_api_key
# Or (alternative)
export CLAUDE_API_KEY=your_api_key
```

### Model Configuration

```bash
# Set default provider
export RLM_PROVIDER=claude

# Set default model
export RLM_DEFAULT_MODEL=claude-sonnet

# Set fallback model
export RLM_FALLBACK_MODEL=haiku
```

---

## MCP Server Tools

When using RLM Analyzer as an MCP server, these tools are available:

| Tool | Description |
|------|-------------|
| `rlm_analyze` | General analysis with custom queries |
| `rlm_summarize` | Codebase summary |
| `rlm_architecture` | Architecture analysis |
| `rlm_security` | Security vulnerability analysis |
| `rlm_dependencies` | Dependency analysis |
| `rlm_refactor` | Refactoring opportunities |
| `rlm_ask` | Ask specific questions |
| `rlm_config` | Get configuration status |

All MCP tools accept a `provider` parameter (`gemini`, `bedrock`, or `claude`) and `model` parameter.

---

## Full Model ID Reference

For the complete list of model IDs, see:
- **Bedrock**: [AWS Bedrock Supported Models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html)
- **Bedrock Inference Profiles**: [Inference Profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html)
- **Claude (Anthropic)**: [Claude Models](https://docs.anthropic.com/en/docs/about-claude/models)
