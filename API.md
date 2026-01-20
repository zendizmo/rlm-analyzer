# RLM Analyzer API Reference

Complete API documentation for programmatic usage of RLM Analyzer.

## Table of Contents

- [High-Level Analysis Functions](#high-level-analysis-functions)
- [Factory Functions](#factory-functions)
- [Core Classes](#core-classes)
- [Advanced Features](#advanced-features)
- [Types Reference](#types-reference)

---

## High-Level Analysis Functions

### `analyzeCodebase(options)`

Perform a full codebase analysis with customizable options.

```typescript
import { analyzeCodebase } from 'rlm-analyzer';

const result = await analyzeCodebase({
  directory: '/path/to/project',
  query: 'Explain the authentication flow',
  analysisType: 'custom',
  model: 'gemini-3-flash-preview',
  verbose: true,
});
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `directory` | `string` | Yes | Absolute path to the codebase |
| `query` | `string` | No | Custom question or analysis request |
| `analysisType` | `AnalysisType` | No | Type of analysis (default: 'summary') |
| `model` | `string` | No | Model ID or alias |
| `verbose` | `boolean` | No | Enable detailed logging |

**Returns:** `Promise<CodeAnalysisResult>`

---

### `analyzeArchitecture(directory, options?)`

Analyze the architecture and structure of a codebase.

```typescript
import { analyzeArchitecture } from 'rlm-analyzer';

const result = await analyzeArchitecture('/path/to/project');
console.log(result.answer);
```

---

### `analyzeSecurity(directory, options?)`

Perform security vulnerability analysis.

```typescript
import { analyzeSecurity } from 'rlm-analyzer';

const result = await analyzeSecurity('/path/to/project');
console.log(result.answer);
```

---

### `analyzeDependencies(directory, options?)`

Analyze internal and external dependencies.

```typescript
import { analyzeDependencies } from 'rlm-analyzer';

const result = await analyzeDependencies('/path/to/project');
console.log(result.answer);
```

---

### `analyzePerformance(directory, options?)`

Identify performance bottlenecks and optimization opportunities.

```typescript
import { analyzePerformance } from 'rlm-analyzer';

const result = await analyzePerformance('/path/to/project');
console.log(result.answer);
```

---

### `analyzeRefactoring(directory, options?)`

Find refactoring opportunities and code smells.

```typescript
import { analyzeRefactoring } from 'rlm-analyzer';

const result = await analyzeRefactoring('/path/to/project');
console.log(result.answer);
```

---

### `summarizeCodebase(directory, options?)`

Get a comprehensive summary of the codebase.

```typescript
import { summarizeCodebase } from 'rlm-analyzer';

const result = await summarizeCodebase('/path/to/project');
console.log(result.answer);
```

---

### `askQuestion(directory, question, options?)`

Ask a custom question about the codebase.

```typescript
import { askQuestion } from 'rlm-analyzer';

const result = await askQuestion(
  '/path/to/project',
  'How does the payment system integrate with Stripe?'
);
console.log(result.answer);
```

---

### `findUsages(directory, symbol, options?)`

Find all usages of a symbol in the codebase.

```typescript
import { findUsages } from 'rlm-analyzer';

const result = await findUsages('/path/to/project', 'handleSubmit');
console.log(result.answer);
```

---

### `explainFile(directory, filePath, options?)`

Get a detailed explanation of a specific file.

```typescript
import { explainFile } from 'rlm-analyzer';

const result = await explainFile('/path/to/project', 'src/auth/login.ts');
console.log(result.answer);
```

---

### `loadFiles(directory, options?)`

Load files from a directory for manual processing.

```typescript
import { loadFiles } from 'rlm-analyzer';

const files = await loadFiles('/path/to/project', {
  include: ['.ts', '.tsx'],
  exclude: ['node_modules', 'dist'],
});

console.log(`Loaded ${Object.keys(files).length} files`);
```

---

## Factory Functions

### `createAnalyzer(options?)`

Create a pre-configured analyzer instance.

```typescript
import { createAnalyzer } from 'rlm-analyzer';

const analyzer = createAnalyzer({
  model: 'fast',
  verbose: true,
});

const result = await analyzer.analyze('/path/to/project', {
  query: 'What are the main components?',
});

// Access underlying orchestrator
const orchestrator = analyzer.orchestrator;

// Get configuration
console.log(analyzer.modelConfig.defaultModel);
```

**Options:**

| Name | Type | Description |
|------|------|-------------|
| `model` | `string` | Model ID or alias |
| `fallbackModel` | `string` | Fallback model |
| `verbose` | `boolean` | Enable logging |
| `config` | `Partial<RLMConfig>` | Config overrides |

**Returns:** `AnalyzerInstance`

---

### `createOrchestrator(options?)`

Create a configured RLMOrchestrator instance for advanced usage.

```typescript
import { createOrchestrator, loadFiles } from 'rlm-analyzer';

const orchestrator = createOrchestrator({ model: 'smart' });
const files = await loadFiles('./src');

const result = await orchestrator.processQuery(
  'Analyze the architecture',
  { files, variables: {}, mode: 'code-analysis' }
);
```

---

### `getModelConfig(options?)`

Get the resolved model configuration.

```typescript
import { getModelConfig } from 'rlm-analyzer';

const config = getModelConfig();
console.log(`Default: ${config.defaultModel} (${config.defaultSource})`);
console.log(`Fallback: ${config.fallbackModel} (${config.fallbackSource})`);

// With override
const custom = getModelConfig({ model: 'fast' });
```

---

## Core Classes

### `RLMOrchestrator`

The main orchestrator that manages the RLM execution loop.

```typescript
import { RLMOrchestrator, getDefaultRLMConfig } from 'rlm-analyzer';

const config = getDefaultRLMConfig('gemini-3-flash-preview');
config.maxTurns = 15;

const orchestrator = new RLMOrchestrator(config, true);
```

#### Constructor

```typescript
new RLMOrchestrator(config: RLMConfig, verbose?: boolean)
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `enableContextCompression` | `boolean` | Enable context compression (default: true) |
| `enableParallelExecution` | `boolean` | Enable parallel sub-LLM calls (default: true) |
| `enableContextRotDetection` | `boolean` | Enable context rot detection (default: true) |
| `enableIterativeRefinement` | `boolean` | Enable iterative refinement (default: false) |

#### Methods

##### `processQuery(query, context)`

Execute a query against a loaded codebase.

```typescript
const result = await orchestrator.processQuery(
  'Analyze the architecture',
  {
    files: loadedFiles,
    variables: {},
    mode: 'code-analysis',
  }
);
```

**Returns:** `Promise<RLMResult>`

##### `getCompressionMetrics()`

Get current compression metrics.

```typescript
const metrics = orchestrator.getCompressionMetrics();
console.log(`Compression level: ${metrics.level}`);
console.log(`Tokens used: ${metrics.metrics.tokensUsed}`);
```

##### `getContextRotStats()`

Get context rot detection statistics.

```typescript
const stats = orchestrator.getContextRotStats();
console.log(`Rot indicators: ${stats.rotIndicators}`);
```

##### `getRefinementHistory()`

Get refinement pass history (if enabled).

```typescript
const history = orchestrator.getRefinementHistory();
history.forEach(pass => {
  console.log(`Pass ${pass.pass}: score ${pass.qualityScore}`);
});
```

##### `executeParallelQueries(queries, executor)`

Execute multiple sub-LLM queries in parallel.

```typescript
const results = await orchestrator.executeParallelQueries(
  [
    { id: 'auth', query: 'Analyze authentication' },
    { id: 'api', query: 'Analyze API structure' },
  ],
  async (query) => await myLLMCall(query)
);
```

---

### `ContextManager`

Manages context compression and memory bank.

```typescript
import { ContextManager, createContextManager } from 'rlm-analyzer';

// Using factory function
const manager = createContextManager({
  slidingWindowSize: 5,
  maxMemoryEntries: 30,
  maxResultLength: 2000,
});

// Compress a sub-LLM result
const compressed = manager.compressResult(longResult);

// Register a turn for history tracking
manager.registerTurn(turnNumber, response, result, error);

// Get memory bank
const memories = manager.getMemoryBank();

// Get token savings estimate
const savings = manager.getTokenSavingsEstimate();
console.log(`Savings: ${savings.savings}%`);
```

---

## Advanced Features

### `ParallelExecutor`

Execute multiple sub-LLM queries concurrently.

```typescript
import { ParallelExecutor } from 'rlm-analyzer';

const executor = new ParallelExecutor({
  maxConcurrent: 5,
  retryCount: 2,
  callTimeout: 30000,
  failFast: false,
});

const results = await executor.executeBatch(
  [
    { id: 'q1', query: 'Query 1' },
    { id: 'q2', query: 'Query 2' },
  ],
  async (query) => await callLLM(query)
);

console.log(results.results.get('q1'));
console.log(`Total time: ${results.totalTimeMs}ms`);
```

**Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxConcurrent` | `number` | 3 | Max concurrent queries |
| `retryCount` | `number` | 2 | Retry attempts on failure |
| `callTimeout` | `number` | 30000 | Timeout per query (ms) |
| `failFast` | `boolean` | false | Stop on first error |

---

### `AdaptiveCompressor`

Dynamically adjust compression based on context usage.

```typescript
import { AdaptiveCompressor } from 'rlm-analyzer';

const compressor = new AdaptiveCompressor({
  maxContextTokens: 100000,
  warningThreshold: 0.7,
  criticalThreshold: 0.85,
});

// Update usage after each turn
compressor.updateUsage(estimatedTokens);

// Get current compression level
const level = compressor.getCompressionLevel();
// Returns: 'none' | 'normal' | 'aggressive' | 'emergency'

// Get adaptive max length for results
const maxLen = compressor.getMaxResultLength(2000);

// Compress content adaptively
const compressed = compressor.compressAdaptively(content, maxLen);

// Estimate tokens in text
const tokens = AdaptiveCompressor.estimateTokens(text);
```

---

### `ContextRotDetector`

Detect when the model loses track of context.

```typescript
import { ContextRotDetector } from 'rlm-analyzer';

const detector = new ContextRotDetector();

// Analyze a model response for rot indicators
const indicators = detector.analyzeResponse(modelResponse);

if (indicators.needsMemoryInjection) {
  // Generate memory reminder
  const injection = detector.generateMemoryInjection(memoryBank);
  // Add injection to next prompt
}

console.log(`Confusion phrases: ${indicators.confusionPhrases}`);
console.log(`Repetition detected: ${indicators.repetitionDetected}`);
```

---

### `SelectiveAttention`

Filter memories by relevance to current query.

```typescript
import { SelectiveAttention } from 'rlm-analyzer';

const attention = new SelectiveAttention();

// Set the current query context
attention.setQueryContext('security vulnerabilities in authentication');

// Adjust weights dynamically
attention.adjustWeightsForQuery('security vulnerabilities');

// Score a single memory
const score = attention.scoreMemory(memoryEntry);

// Filter memories by relevance
const relevant = attention.filterByAttention(allMemories, 10);
```

---

### `IterativeRefiner`

Multi-pass analysis for quality improvement.

```typescript
import { IterativeRefiner } from 'rlm-analyzer';

const refiner = new IterativeRefiner({
  maxPasses: 3,
  qualityThreshold: 0.85,
  improvementThreshold: 0.05,
});

// Evaluate result quality
const score = refiner.evaluateQuality(result, originalQuery);

// Generate critique prompt for next pass
const critiquePrompt = refiner.generateCritiquePrompt(result, originalQuery);

// Check if refinement should continue
const { shouldContinue, reason } = refiner.shouldContinueRefinement(
  currentScore,
  previousScore
);
```

---

## Types Reference

### Core Types

```typescript
// Analysis types
type AnalysisType =
  | 'summary'
  | 'architecture'
  | 'dependencies'
  | 'security'
  | 'performance'
  | 'refactor'
  | 'custom';

// RLM Configuration
interface RLMConfig {
  model: string;
  subModel: string;
  maxTurns: number;
  temperature: number;
  mode: 'code-analysis' | 'document-qa' | 'education';
}

// Analysis result
interface RLMResult {
  success: boolean;
  answer: string | null;
  error: string | null;
  turns: number;
  subLLMCalls: number;
  tokenSavings?: TokenSavings;
}

// Code analysis options
interface CodeAnalysisOptions {
  directory: string;
  query?: string;
  analysisType?: AnalysisType;
  model?: string;
  verbose?: boolean;
}

// Token savings info
interface TokenSavings {
  originalChars: number;
  compressedChars: number;
  savings: number; // percentage
}
```

### Context Management Types

```typescript
// Memory entry in the memory bank
interface MemoryEntry {
  id: string;
  type: 'file_analysis' | 'pattern' | 'dependency' | 'issue' | 'summary';
  content: string;
  source?: string;
  importance: number; // 1-10
  turn: number;
}

// Compressed turn for history
interface CompressedTurn {
  turn: number;
  summary: string;
  findings: string[];
  hadCode: boolean;
  hadError: boolean;
}

// Context manager configuration
interface ContextManagerConfig {
  slidingWindowSize: number;
  maxMemoryEntries: number;
  maxSummaryLength: number;
  maxResultLength: number;
  aggressiveCompression: boolean;
}
```

### Advanced Feature Types

```typescript
// Parallel execution config
interface ParallelExecutionConfig {
  maxConcurrent: number;
  retryCount: number;
  callTimeout: number;
  failFast: boolean;
}

// Parallel batch result
interface ParallelBatchResult {
  results: Map<string, string>;
  errors: Map<string, Error>;
  totalTimeMs: number;
  timings: Map<string, number>;
}

// Adaptive compression config
interface AdaptiveCompressionConfig {
  maxContextTokens: number;
  warningThreshold: number;
  criticalThreshold: number;
}

// Context usage metrics
interface ContextUsageMetrics {
  tokensUsed: number;
  maxTokens: number;
  usagePercent: number;
  memoryBankSize: number;
  compressedTurnsCount: number;
}

// Context rot indicators
interface ContextRotIndicators {
  confusionPhrases: number;
  repetitionDetected: boolean;
  contextReferences: number;
  needsMemoryInjection: boolean;
}

// Attention weights for selective filtering
interface AttentionWeights {
  file_analysis: number;
  pattern: number;
  dependency: number;
  issue: number;
  summary: number;
  recency: number;
  importance: number;
}

// Refinement configuration
interface RefinementConfig {
  maxPasses: number;
  qualityThreshold: number;
  improvementThreshold: number;
}

// Refinement pass result
interface RefinementPassResult {
  pass: number;
  qualityScore: number;
  improvements: string[];
  critique: string;
}
```

### Model Configuration Types

```typescript
// Model config options
interface ModelConfigOptions {
  model?: string;
  fallbackModel?: string;
}

// Resolved model config
interface ResolvedModelConfig {
  defaultModel: string;
  defaultSource: 'cli' | 'env' | 'config' | 'builtin';
  fallbackModel: string;
  fallbackSource: 'cli' | 'env' | 'config' | 'builtin';
}
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Primary API key |
| `RLM_API_KEY` | Alternative API key |
| `RLM_DEFAULT_MODEL` | Default model override |
| `RLM_FALLBACK_MODEL` | Fallback model override |

---

## Model Aliases

| Alias | Model ID |
|-------|----------|
| `fast` | `gemini-3-flash-preview` |
| `smart` | `gemini-3-pro-preview` |
| `pro` | `gemini-3-pro-preview` |
| `flash` | `gemini-3-flash-preview` |
| `default` | `gemini-3-flash-preview` |
| `flash-2` | `gemini-2.0-flash-exp` |
| `flash-2.5` | `gemini-2.5-flash` |
