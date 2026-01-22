/**
 * RLM Analyzer
 * Recursive Language Model code analysis tool
 *
 * Based on MIT CSAIL research: arXiv:2512.24601v1
 * "Recursive Language Models: A Paradigm for Processing Arbitrarily Long Inputs"
 */

// Types
export * from './types.js';

// Configuration
export {
  getApiKey,
  getAIClient,
  initConfig,
  hasApiKey,
  hasAnyCredentials,
  hasBedrockCredentials,
  initializeProvider,
  getLLMProvider,
  detectProvider,
} from './config.js';

// Provider abstraction layer
export {
  // Factory functions
  createProvider,
  getProvider,
  initializeProvider as initProvider,
  resetProvider,

  // Provider implementations (for advanced usage)
  GeminiProvider,
  BedrockProvider,

  // Types
  type ProviderName,
  type ProviderConfig,
  type LLMProvider,
  type Message,
  type GenerateOptions,
  type GenerateResponse,
} from './providers/index.js';

// Model configuration (new in v1.1)
export {
  // Resolution functions
  resolveModelConfig,
  getDefaultModel,
  getFallbackModel,
  resolveModelAlias,
  resolveProviderModelAlias,
  isModelAlias,
  isProviderModelAlias,
  getAvailableModelsForProvider,

  // Display helpers
  getModelConfigDisplay,
  getAliasesDisplay,
  getProviderAliasesDisplay,

  // Constants
  MODEL_ALIASES,
  AVAILABLE_MODELS,
  AVAILABLE_BEDROCK_MODELS,
  PROVIDER_MODEL_ALIASES,

  // Backward compatibility (deprecated)
  DEFAULT_MODEL,
  FALLBACK_MODEL,

  // Types
  type ModelConfigOptions,
  type ResolvedModelConfig,
} from './models.js';

// Core components
export { RLMExecutor } from './executor.js';
export { RLMOrchestrator } from './orchestrator.js';

// Context management (token optimization)
export {
  ContextManager,
  createContextManager,
  type MemoryEntry,
  type CompressedTurn,
  type ContextManagerConfig,
} from './context-manager.js';

// Advanced features (RLM paper implementations)
export {
  // Parallel execution
  ParallelExecutor,
  type ParallelExecutionConfig,
  type ParallelBatchResult,

  // Adaptive compression
  AdaptiveCompressor,
  type AdaptiveCompressionConfig,
  type ContextUsageMetrics,

  // Context rot detection
  ContextRotDetector,
  type ContextRotIndicators,

  // Selective attention
  SelectiveAttention,
  type AttentionWeights,

  // Iterative refinement
  IterativeRefiner,
  type RefinementConfig,
  type RefinementPassResult,
} from './advanced-features.js';

// High-level analysis functions
export {
  loadFiles,
  loadFilesWithIndex,
  analyzeCodebase,
  analyzeArchitecture,
  analyzeDependencies,
  analyzeSecurity,
  analyzePerformance,
  analyzeRefactoring,
  summarizeCodebase,
  findUsages,
  explainFile,
  askQuestion,
  clearIndexCache,
} from './analyzer.js';

// Structural indexing and caching
export {
  buildStructuralIndex,
  updateStructuralIndex,
  loadCachedIndex,
  saveIndexToCache,
  clearCache,
  getCachePath,
  hashContent,
  hashProject,
  extractImports,
  extractExports,
  buildDependencyGraph,
  buildClusters,
  getAnalysisPriority,
  getDependents,
  getDependencies,
  getFileCluster,
  needsChunking,
  chunkFile,
} from './structural-index.js';

// Large file handling
export {
  smartChunkFile,
  extractChunkSkeleton,
  describeChunk,
  processLargeFile,
  createLargeFileSummary,
  getChunkContent,
  type ProcessedLargeFile,
} from './file-chunker.js';

// Prompts
export {
  CODE_ANALYSIS_PROMPT,
  ARCHITECTURE_PROMPT,
  DEPENDENCY_PROMPT,
  SECURITY_PROMPT,
  PERFORMANCE_PROMPT,
  REFACTOR_PROMPT,
  SUMMARY_PROMPT,
  getSystemPrompt,
  getAnalysisPrompt,
  buildContextMessage,
} from './prompts.js';

// Web grounding for security recommendations
export {
  verifySecurityRecommendations,
  appendGroundingSources,
  type GroundingResult,
} from './grounding.js';

// ============================================================================
// Factory Functions for IDE Integration (Claude Code, Codex, Cursor)
// ============================================================================

import { RLMOrchestrator } from './orchestrator.js';
import { analyzeCodebase } from './analyzer.js';
import { resolveModelConfig } from './models.js';
import { initializeProvider } from './config.js';
import { getDefaultRLMConfig } from './types.js';
import type { RLMConfig, CodeAnalysisOptions, CodeAnalysisResult } from './types.js';
import type { ResolvedModelConfig, ModelConfigOptions } from './models.js';

import type { ProviderName } from './providers/types.js';

/**
 * Options for creating an analyzer instance
 */
export interface CreateAnalyzerOptions {
  /** Model to use (can be alias like 'fast' or 'smart') */
  model?: string;
  /** Fallback model to use */
  fallbackModel?: string;
  /** LLM provider to use (default: gemini) */
  provider?: ProviderName;
  /** Enable verbose output */
  verbose?: boolean;
  /** RLM configuration overrides */
  config?: Partial<RLMConfig>;
}

/**
 * Analyzer instance returned by createAnalyzer()
 */
export interface AnalyzerInstance {
  /** Analyze a directory */
  analyze: (directory: string, options?: Partial<CodeAnalysisOptions>) => Promise<CodeAnalysisResult>;

  /** The underlying orchestrator */
  orchestrator: RLMOrchestrator;

  /** The resolved configuration */
  config: RLMConfig;

  /** The resolved model configuration */
  modelConfig: ResolvedModelConfig;
}

/**
 * Create an analyzer instance for IDE integration
 *
 * This is the recommended way to use RLM Analyzer programmatically.
 * It handles model resolution using the priority chain and returns
 * a configured analyzer ready for use.
 *
 * @example
 * ```typescript
 * import { createAnalyzer } from 'rlm-analyzer';
 *
 * // Use default configuration
 * const analyzer = createAnalyzer();
 * const result = await analyzer.analyze('./my-project');
 *
 * // Use specific model
 * const fastAnalyzer = createAnalyzer({ model: 'fast' });
 * const result = await fastAnalyzer.analyze('./my-project');
 *
 * // Access the orchestrator directly
 * const orchestrator = analyzer.orchestrator;
 * ```
 *
 * @param options - Configuration options
 * @returns Analyzer instance with analyze function and orchestrator
 */
export function createAnalyzer(options: CreateAnalyzerOptions = {}): AnalyzerInstance {
  const provider = options.provider || 'gemini';

  // Initialize the provider
  initializeProvider(provider);

  const modelConfig = resolveModelConfig({
    model: options.model,
    fallbackModel: options.fallbackModel,
    provider,
  });

  const config = getDefaultRLMConfig(modelConfig.defaultModel);

  // Apply any config overrides
  if (options.config) {
    Object.assign(config, options.config);
  }

  const orchestrator = new RLMOrchestrator(config, options.verbose);

  const analyze = async (
    directory: string,
    analysisOptions: Partial<Omit<CodeAnalysisOptions, 'directory'>> = {}
  ): Promise<CodeAnalysisResult> => {
    return analyzeCodebase({
      directory,
      ...analysisOptions,
      model: modelConfig.defaultModel,
      provider,
      verbose: options.verbose,
    });
  };

  return {
    analyze,
    orchestrator,
    config,
    modelConfig,
  };
}

/**
 * Options for creating an orchestrator instance
 */
export interface CreateOrchestratorOptions {
  /** Model to use (can be alias like 'fast' or 'smart') */
  model?: string;
  /** Enable verbose output */
  verbose?: boolean;
  /** RLM configuration overrides */
  config?: Partial<RLMConfig>;
}

/**
 * Create a configured RLMOrchestrator instance
 *
 * Use this when you need direct access to the orchestrator
 * for custom workflows or advanced use cases.
 *
 * @example
 * ```typescript
 * import { createOrchestrator, loadFiles } from 'rlm-analyzer';
 *
 * const orchestrator = createOrchestrator({ model: 'smart' });
 * const files = await loadFiles('./src');
 * const result = await orchestrator.processQuery(
 *   'Explain this codebase',
 *   { files, variables: {}, mode: 'code-analysis' }
 * );
 * ```
 *
 * @param options - Configuration options
 * @returns Configured RLMOrchestrator instance
 */
export function createOrchestrator(options: CreateOrchestratorOptions = {}): RLMOrchestrator {
  const modelConfig = resolveModelConfig({ model: options.model });
  const config = getDefaultRLMConfig(modelConfig.defaultModel);

  // Apply any config overrides
  if (options.config) {
    Object.assign(config, options.config);
  }

  return new RLMOrchestrator(config, options.verbose);
}

/**
 * Get resolved model configuration
 *
 * Use this to check what models will be used based on
 * the current environment, config file, and any overrides.
 *
 * @example
 * ```typescript
 * import { getModelConfig } from 'rlm-analyzer';
 *
 * const config = getModelConfig();
 * console.log(`Default model: ${config.defaultModel}`);
 * console.log(`Source: ${config.defaultSource}`);
 *
 * // With override
 * const custom = getModelConfig({ model: 'fast' });
 * ```
 *
 * @param options - Optional model overrides
 * @returns Resolved model configuration with source information
 */
export function getModelConfig(options: ModelConfigOptions = {}): ResolvedModelConfig {
  return resolveModelConfig(options);
}
