# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.4] - 2026-01-20

### Added
- **Web Grounding for Security Analysis**: Use Google Search to verify package version recommendations
  - New `--grounding` / `-g` CLI flag for security analysis
  - Automatically verifies and updates package version numbers using real-time web data
  - Adds source URLs to recommendations for transparency
  - Programmatic API: `enableWebGrounding: true` option in `analyzeSecurity()`
- New `verifySecurityRecommendations()` and `appendGroundingSources()` exports

### Changed
- Security recommendations now optionally include verified package versions from web sources

---

## [1.3.3] - 2026-01-20

### Added
- `--version` / `-V` flag to display CLI version
- Real-time Sub-LLM progress callback (`onSubLLMCall`) for live counter updates
- Dynamic timeout based on codebase size (up to 15 min for 200+ files)

### Fixed
- **Major: Sub-LLM calls now work properly** - Switched from Python to JavaScript prompts
  - Previous Python-to-JS conversion was causing syntax errors
  - Model now generates native JavaScript code that executes correctly
  - Aham test: 0 Sub-LLM calls → 7 Sub-LLM calls, 303s → 96s (3x faster)

---

## [1.3.2] - 2026-01-20

### Added
- **Real-time Progress Indicator**: CLI now shows live progress during analysis
  - Animated spinner with current phase (Initializing, Analyzing, Executing code, Sub-LLM query, Finalizing)
  - Turn counter updated in real-time
  - **Sub-LLM call counter** - now updates live as sub-LLM calls happen (not just at the end)
  - Elapsed time display
- **Markdown Output**: Save analysis results to markdown files
  - New `--output, -o <file>` option (e.g., `rlm summary -o rlm-context.md`)
  - Generates formatted markdown report with metadata, results, and file list
  - Perfect for documentation or sharing analysis results
- **RLMProgress callback**: New `onProgress` callback option for programmatic progress tracking
  - Added `RLMProgress` type with `turn`, `subCallCount`, `phase`, and `elapsedMs`
  - Useful for building custom progress UIs
- `subCallCount` now included in `RLMTurn` records for tracking during analysis

### Fixed
- **MCP Server via npx**: Fixed critical bug where MCP server wouldn't start when run via `npx rlm-analyzer-mcp`
  - The issue was that symlinks created by npx in `.bin/` weren't being recognized as the main module
  - Now uses `realpathSync()` to resolve symlinks and properly detect the main module
  - Both `npx rlm-analyzer-mcp` and direct `node dist/mcp-server.js` now work correctly
- **Max turns exceeded for large codebases**: Fixed "Max turns (10) exceeded" error on larger projects
  - Max turns now dynamically calculated based on file count:
    - 200+ files → 25 turns
    - 100+ files → 20 turns
    - 50+ files → 15 turns
    - 20+ files → 12 turns
    - Default → 10 turns
  - Can also be overridden via `maxTurns` option in programmatic API

### Improved
- Better user experience during long-running analyses
- Clear visual feedback on analysis progress
- Progress visible by default (no need for `--verbose` flag)
- JSON output mode (`--json`) disables progress for clean output

---

## [1.3.0] - 2026-01-19

### Added

#### Advanced Token Optimization (RLM Paper Implementation)
- **Context Compression**: Automatically compresses sub-LLM results, achieving 50-70% token savings
- **Sliding Window History**: Keeps recent turns in full detail while compressing older context
- **Memory Bank**: Extracts and stores key findings with importance scoring for later synthesis
- **Adaptive Compression**: Dynamically adjusts compression level based on context usage:
  - `none` (< 50% usage)
  - `normal` (50-70% usage)
  - `aggressive` (70-85% usage)
  - `emergency` (> 85% usage)

#### New Advanced Features
- **ParallelExecutor**: Run multiple sub-LLM queries concurrently with retry logic
- **AdaptiveCompressor**: Context-aware compression that responds to token pressure
- **ContextRotDetector**: Detects when model loses track of context and injects memory reminders
- **SelectiveAttention**: Query-based memory filtering for relevance scoring
- **IterativeRefiner**: Multi-pass analysis for quality improvement (opt-in)

#### Orchestrator Enhancements
- New feature flags: `enableContextCompression`, `enableParallelExecution`, `enableContextRotDetection`, `enableIterativeRefinement`
- New accessor methods: `getCompressionMetrics()`, `getContextRotStats()`, `getRefinementHistory()`
- `executeParallelQueries()` method for batch sub-LLM execution

#### New Exports
- `ContextManager` and related types
- All advanced feature classes and their configuration types
- Subpath exports for `./advanced-features` and `./context-manager`

### Changed
- Verbose mode now shows compression savings and history optimization
- Sub-LLM results are automatically compressed before being added to context
- History is optimized using sliding window when message count exceeds threshold

### Fixed
- Improved handling of large codebases with many files
- Better error recovery in sub-LLM execution

---

## [1.2.0] - 2026-01-18

### Added
- MCP (Model Context Protocol) server for Claude Code and Cursor integration
- New MCP tools: `rlm_analyze`, `rlm_summarize`, `rlm_architecture`, `rlm_security`, `rlm_dependencies`, `rlm_refactor`, `rlm_ask`, `rlm_config`
- Binary aliases: `rlm-mcp`, `rlm-analyzer-mcp`

### Changed
- Improved system prompts for better analysis quality
- Enhanced error messages for API issues

---

## [1.1.0] - 2026-01-18

### Added
- **Model Configuration System**: Flexible model selection with priority chain
  - CLI `--model` flag (highest priority)
  - Environment variables: `RLM_DEFAULT_MODEL`, `RLM_FALLBACK_MODEL`
  - Config file: `~/.rlm-analyzer/config.json`
  - Built-in defaults
- **Model Aliases**: `fast`, `smart`, `pro`, `flash`, `flash-2`, `flash-2.5`
- Factory functions: `createAnalyzer()`, `createOrchestrator()`, `getModelConfig()`
- `rlm test` command to verify API connection

### Changed
- Default model updated to `gemini-3-flash-preview`
- Improved CLI help with model configuration details

---

## [1.0.0] - 2026-01-18

### Added
- Initial release
- Core RLM orchestrator with REPL execution
- Sub-LLM delegation via `llm_query()` function
- Analysis types: summary, architecture, dependencies, security, performance, refactor
- CLI commands: `summary`, `arch`, `deps`, `security`, `perf`, `refactor`, `find`, `explain`, `ask`, `config`
- Sandboxed code execution with security patterns
- Support for 20+ programming languages
- JSON output mode for scripting
- Verbose mode for debugging

### Security
- Blocked dangerous patterns: `eval`, `exec`, `process.`, network calls
- Read-only analysis - no file modifications
- API keys stored securely, never logged

---

## [0.1.0] - 2026-01-18

### Added
- Initial prototype
- Basic file loading and analysis
- Gemini API integration
