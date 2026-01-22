# How RLM Analyzer Works

**RLM = Recursive Language Model**

## Overview

RLM Analyzer uses a novel approach to analyze codebases that exceed traditional LLM context limits. Instead of dumping an entire codebase into a single prompt (which would overflow context), it uses **recursive delegation** where a main LLM orchestrates multiple sub-LLM calls to analyze files incrementally.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User Query                              │
│         "Summarize this codebase" or "Find security bugs"   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator (Main LLM)                   │
│  • Receives query + file tree of your codebase              │
│  • Decides which files to read                              │
│  • Can spawn "Sub-LLMs" to analyze individual files         │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Sub-LLM  │   │ Sub-LLM  │   │ Sub-LLM  │
        │ File A   │   │ File B   │   │ File C   │
        └──────────┘   └──────────┘   └──────────┘
              │               │               │
              └───────────────┼───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator                              │
│  • Collects all sub-analysis results                        │
│  • Synthesizes final answer                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                        Final Answer
```

## Key Concepts

### 1. Turns

A **turn** is a single round-trip interaction with the orchestrator LLM:

```
Turn = User/System sends input → LLM processes → LLM responds with action
```

The orchestrator runs multiple turns to complete an analysis:

```
Turn 1: "Here's the file tree" → LLM: "I need to read package.json"
Turn 2: "Here's package.json" → LLM: "Now read src/index.ts"
Turn 3: "Here's src/index.ts" → LLM: "Spawn sub-LLM to analyze auth/"
Turn 4: "Sub-LLM results..." → LLM: "FINAL(Here's my analysis...)"
```

**Why multiple turns?**
- LLM can't see everything at once (context limits)
- Each turn adds new information
- LLM decides what to explore next
- Continues until it has enough info to answer

**Verbose output shows turns:**
```
⠹ Analyzing | Turn: 3 | Sub-LLM: 2 | Time: 5.2s
```

### 2. Sub-LLMs

A **sub-LLM** is a separate LLM call spawned by the orchestrator to analyze a specific piece of code. Think of it as delegation:

```
Orchestrator: "I found auth/login.ts but it's complex.
              Let me spawn a sub-LLM to analyze it deeply."

Sub-LLM:      Receives just login.ts + focused question
              Returns: "This file handles JWT authentication with..."

Orchestrator: Stores sub-LLM result in memory, continues analysis
```

**Why sub-LLMs?**
- **Focused analysis**: Sub-LLM gets just one file + specific question
- **Parallel processing**: Multiple sub-LLMs can run concurrently
- **Context efficiency**: Main orchestrator doesn't need full file contents
- **Deep expertise**: Sub-LLM can focus without distraction

**Sub-LLM call in code:**
```python
# Orchestrator spawns sub-LLM
result = llm_query(
    "Analyze the authentication flow in this code",
    file_content
)
# Result is compressed and stored in memory
```

**Example sub-LLM delegation:**
```
Orchestrator sees 50 files
    ├── Sub-LLM 1: "Analyze src/auth/*" (5 files)
    ├── Sub-LLM 2: "Analyze src/api/*" (10 files)
    ├── Sub-LLM 3: "Analyze src/db/*" (8 files)
    └── Orchestrator synthesizes all results
```

### 3. Recursive Analysis

Sub-LLMs can themselves spawn more sub-LLMs, creating a recursive tree:

```
Orchestrator
├── Sub-LLM: Analyze src/auth/
│   ├── Sub-Sub-LLM: login.ts (deep dive)
│   └── Sub-Sub-LLM: session.ts (deep dive)
├── Sub-LLM: Analyze src/api/
│   ├── Sub-Sub-LLM: routes.ts
│   └── Sub-Sub-LLM: middleware.ts
└── Synthesis: Combine all findings
```

This is why it's called "Recursive" Language Models - the analysis recurses down into the codebase.

### 4. Context Optimization

Instead of dumping the entire codebase into context, the orchestrator:

1. **Shows file tree first** - LLM sees the structure without file contents
2. **LLM requests specific files** - Only reads what it needs
3. **Analyzes incrementally** - Processes in manageable chunks
4. **Compresses results** - Sub-LLM outputs are summarized

### 5. Multi-turn Conversation

The orchestrator runs multiple "turns" - each turn it can:

- Request more files to read
- Spawn sub-LLMs for deep analysis
- Refine its understanding
- Update its memory bank

```
Turn 1: LLM sees file tree → requests src/index.ts, package.json
Turn 2: LLM reads files → spawns Sub-LLM to analyze src/auth/
Turn 3: Sub-LLM returns → LLM synthesizes final summary
```

### 6. REPL-Style Execution

The orchestrator works like a Python REPL. It can write code to:

```python
# Read a file
content = read_file("src/auth/login.ts")

# Search for patterns
matches = search("authentication", ["*.ts"])

# Delegate to sub-LLM
result = llm_query("Analyze authentication flow in this code", content)

# Store findings in memory
memory.add("auth_pattern", "Uses JWT with refresh tokens")

# When done, call FINAL()
FINAL("The codebase uses JWT authentication with...")
```

### 7. Memory Bank

The orchestrator maintains a memory bank to track:

- File analysis results
- Identified patterns
- Detected issues
- Dependencies
- Key findings

This prevents "context rot" where the LLM forgets earlier findings.

## Why "Recursive"?

The name comes from the ability to recursively delegate work:

1. **Main query** → Orchestrator
2. **Sub-query** → Sub-LLM A
3. **Sub-sub-query** → Sub-LLM A.1
4. Results bubble up and combine

This creates a tree of analysis that can handle arbitrarily large codebases without context overflow.

## Token Optimization

RLM Analyzer implements several techniques to minimize token usage:

### Adaptive Compression

| Context Usage | Compression Level | Action |
|---------------|-------------------|--------|
| < 50% | `none` | Full detail |
| 50-70% | `normal` | Key points only |
| 70-85% | `aggressive` | Heavy summarization |
| > 85% | `emergency` | Critical info only |

### Sliding Window History

- Recent turns: Full detail
- Older turns: Compressed summaries
- Very old: Key findings only

### Parallel Execution

Sub-LLM calls run concurrently for faster analysis:

```
┌─────────────────────────────────────┐
│           Parallel Executor          │
├──────────┬──────────┬───────────────┤
│ Sub-LLM 1│ Sub-LLM 2│ Sub-LLM 3     │
│ auth/    │ api/     │ utils/        │
└──────────┴──────────┴───────────────┘
              ↓ (concurrent)
         Combined Results
```

## Example Flow

Here's how a security analysis works:

```
User: "Find security vulnerabilities in this codebase"

Turn 1:
  Orchestrator: [Sees file tree with 200 files]
  Action: Request package.json, src/index.ts

Turn 2:
  Orchestrator: [Reads files, identifies Express app]
  Action: Spawn Sub-LLM for src/auth/*, src/api/*

Turn 3:
  Sub-LLM (auth): "Found hardcoded JWT secret in config.ts"
  Sub-LLM (api): "SQL injection risk in users.ts line 45"
  Orchestrator: [Records findings in memory]

Turn 4:
  Orchestrator: [Analyzes dependencies]
  Action: Check for known vulnerable packages

Turn 5:
  Orchestrator: FINAL("Found 3 security issues:
    1. Hardcoded JWT secret...
    2. SQL injection vulnerability...
    3. Outdated dependency with CVE...")
```

## Benefits

1. **No context overflow** - Can analyze codebases of any size
2. **Cost efficient** - Only processes what's needed
3. **Deep analysis** - Sub-LLMs focus on specific areas
4. **Parallel processing** - Faster than sequential analysis
5. **Provider agnostic** - Works with Gemini, Bedrock (Claude/Nova/Llama), and Claude (Anthropic API)

## Research Foundation

RLM Analyzer is based on MIT CSAIL research:

> [Recursive Language Models: A Paradigm for Processing Arbitrarily Long Inputs](https://arxiv.org/abs/2512.24601)

The paper demonstrates that RLMs can process inputs **100x beyond** traditional context limits while maintaining coherent analysis.
