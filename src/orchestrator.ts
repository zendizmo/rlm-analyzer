/**
 * RLM Orchestrator
 * Manages the conversation loop between model and REPL
 * Uses Gemini 3 Flash via @google/genai SDK
 *
 * Token Optimization: Implements context compression techniques from
 * the RLM paper (arXiv:2512.24601) for efficient token usage:
 * - Sliding window for conversation history
 * - Memory bank for key findings
 * - Result compression for sub-LLM outputs
 */

import type {
  RLMConfig,
  RLMContext,
  RLMResult,
  RLMTurn,
  RLMProgress,
} from './types.js';
import { RLMExecutor } from './executor.js';
import { getAIClient } from './config.js';
import { getDefaultModel, getFallbackModel } from './models.js';
import { getSystemPrompt, buildContextMessage } from './prompts.js';
import { ContextManager, type ContextManagerConfig } from './context-manager.js';
import {
  ParallelExecutor,
  AdaptiveCompressor,
  ContextRotDetector,
  SelectiveAttention,
  IterativeRefiner,
  type ParallelExecutionConfig,
  type AdaptiveCompressionConfig,
  type RefinementConfig,
} from './advanced-features.js';
import type { Content } from '@google/genai';

/**
 * RLM Orchestrator manages the agentic loop
 */

/**
 * Thresholds for minimum sub-LLM calls based on codebase size
 * These can be adjusted to tune analysis depth vs speed
 */
export const SUB_LLM_THRESHOLDS = {
  /** Files >= 200: require at least 5 sub-LLM calls */
  VERY_LARGE: { files: 200, minCalls: 5 },
  /** Files >= 100: require at least 4 sub-LLM calls */
  LARGE: { files: 100, minCalls: 4 },
  /** Files >= 50: require at least 3 sub-LLM calls */
  MEDIUM: { files: 50, minCalls: 3 },
  /** Files >= 20: require at least 2 sub-LLM calls */
  SMALL: { files: 20, minCalls: 2 },
  /** Default minimum for tiny codebases */
  DEFAULT_MIN: 1,
} as const;

/**
 * Calculate minimum required sub-LLM calls based on file count
 * Larger codebases require more recursive analysis for quality results
 */
function getMinSubLLMCalls(fileCount: number): number {
  if (fileCount >= SUB_LLM_THRESHOLDS.VERY_LARGE.files) return SUB_LLM_THRESHOLDS.VERY_LARGE.minCalls;
  if (fileCount >= SUB_LLM_THRESHOLDS.LARGE.files) return SUB_LLM_THRESHOLDS.LARGE.minCalls;
  if (fileCount >= SUB_LLM_THRESHOLDS.MEDIUM.files) return SUB_LLM_THRESHOLDS.MEDIUM.minCalls;
  if (fileCount >= SUB_LLM_THRESHOLDS.SMALL.files) return SUB_LLM_THRESHOLDS.SMALL.minCalls;
  return SUB_LLM_THRESHOLDS.DEFAULT_MIN;
}

/** Advanced features configuration */
export interface AdvancedFeaturesConfig {
  /** Parallel execution config */
  parallel?: Partial<ParallelExecutionConfig>;
  /** Adaptive compression config */
  adaptiveCompression?: Partial<AdaptiveCompressionConfig>;
  /** Refinement config */
  refinement?: Partial<RefinementConfig>;
  /** Max context tokens for adaptive compression */
  maxContextTokens?: number;
}

export class RLMOrchestrator {
  private config: RLMConfig;
  private executor: RLMExecutor;
  private verbose: boolean;
  private fallbackModel: string;
  private contextManager: ContextManager;

  // Advanced feature components
  private parallelExecutor: ParallelExecutor;
  private adaptiveCompressor: AdaptiveCompressor;
  private contextRotDetector: ContextRotDetector;
  private selectiveAttention: SelectiveAttention;
  private iterativeRefiner: IterativeRefiner;

  /** Enable/disable context compression (default: true) */
  public enableContextCompression = true;

  /** Enable/disable parallel sub-LLM execution (default: true) */
  public enableParallelExecution = true;

  /** Enable/disable context rot detection (default: true) */
  public enableContextRotDetection = true;

  /** Enable/disable iterative refinement (default: false - opt-in) */
  public enableIterativeRefinement = false;

  constructor(
    config: Partial<RLMConfig> = {},
    verbose = false,
    contextConfig?: Partial<ContextManagerConfig>,
    advancedConfig?: AdvancedFeaturesConfig
  ) {
    // Resolve models dynamically using the priority chain
    const defaultModel = getDefaultModel({ model: config.rootModel });
    const fallback = getFallbackModel();

    this.config = {
      rootModel: config.rootModel || defaultModel,
      subModel: config.subModel || defaultModel,
      maxRecursionDepth: config.maxRecursionDepth || 3,
      maxTurns: config.maxTurns || 10,
      timeoutMs: config.timeoutMs || 300000,
      maxSubCalls: config.maxSubCalls || 15,
      mode: config.mode || 'code-analysis',
    };
    this.fallbackModel = fallback;
    this.executor = new RLMExecutor(this.config.maxSubCalls);
    this.verbose = verbose;

    // Initialize context manager for token optimization
    this.contextManager = new ContextManager(contextConfig);

    // Initialize advanced feature components
    this.parallelExecutor = new ParallelExecutor(advancedConfig?.parallel);
    this.adaptiveCompressor = new AdaptiveCompressor(
      advancedConfig?.maxContextTokens || 100000,
      advancedConfig?.adaptiveCompression
    );
    this.contextRotDetector = new ContextRotDetector();
    this.selectiveAttention = new SelectiveAttention();
    this.iterativeRefiner = new IterativeRefiner(advancedConfig?.refinement);
  }

  /**
   * Process a query with the RLM system
   */
  async processQuery(
    query: string,
    context: RLMContext,
    onTurnComplete?: (turn: RLMTurn) => void,
    onProgress?: (progress: RLMProgress) => void
  ): Promise<RLMResult> {
    const startTime = Date.now();
    const turns: RLMTurn[] = [];

    // Helper to report progress
    const reportProgress = (turn: number, phase: RLMProgress['phase']) => {
      if (onProgress) {
        onProgress({
          turn,
          subCallCount: this.executor.getSubCallCount(),
          phase,
          elapsedMs: Date.now() - startTime,
        });
      }
    };

    reportProgress(0, 'initializing');

    // Initialize executor with files
    this.executor.initialize(context.files);

    // Set up real-time sub-LLM progress callback
    this.executor.setOnSubLLMCall((count: number) => {
      if (onProgress) {
        onProgress({
          turn: turns.length,
          subCallCount: count,
          phase: 'sub-llm',
          elapsedMs: Date.now() - startTime,
        });
      }
    });

    // Reset context manager and advanced features for new query
    this.contextManager.reset();
    this.contextRotDetector.reset();
    this.iterativeRefiner.reset();
    this.selectiveAttention.setQueryContext(query);
    this.selectiveAttention.adjustWeightsForQuery(query);

    // Set up sub-LLM callback with adaptive compression
    this.executor.setSubLLMCallback(async (subQuery: string) => {
      // Report sub-LLM phase
      reportProgress(turns.length, 'sub-llm');

      if (this.verbose) {
        console.log(`  [Sub-LLM] ${subQuery.slice(0, 60)}...`);
      }
      const result = await this.callModel(this.config.subModel, subQuery, 0.3, 2048);

      // Apply adaptive compression based on context usage
      if (this.enableContextCompression) {
        const compressionLevel = this.adaptiveCompressor.getCompressionLevel();
        const baseMaxLength = 1500;
        const adaptiveMaxLength = this.adaptiveCompressor.getMaxResultLength(baseMaxLength);

        const compressed = this.adaptiveCompressor.compressAdaptively(result, adaptiveMaxLength);

        if (this.verbose && compressed.length < result.length) {
          const savings = Math.round((1 - compressed.length / result.length) * 100);
          console.log(`  [Context] Compressed: ${savings}% savings (level: ${compressionLevel})`);
        }
        return compressed;
      }
      return result;
    });

    // Build initial messages
    const systemPrompt = getSystemPrompt(this.config.mode);
    const contextMessage = buildContextMessage(
      Object.keys(context.files).length,
      Object.keys(context.files),
      query
    );

    const history: Content[] = [
      { role: 'user', parts: [{ text: `${systemPrompt}\n\n${contextMessage}` }] },
    ];

    // Main conversation loop
    for (let turn = 1; turn <= this.config.maxTurns; turn++) {
      // Check timeout
      if (Date.now() - startTime > this.config.timeoutMs) {
        return {
          success: false,
          answer: null,
          turns,
          executionTimeMs: Date.now() - startTime,
          subCallCount: this.executor.getSubCallCount(),
          error: 'Timeout exceeded',
          tokenSavings: this.enableContextCompression ? this.getTokenSavings() : undefined,
        };
      }

      if (this.verbose) {
        console.log(`\n--- Turn ${turn} ---`);
      }

      // Report progress at start of each turn
      reportProgress(turn, 'analyzing');

      // Build optimized history (applies sliding window compression)
      const optimizedHistory = this.enableContextCompression
        ? this.contextManager.buildOptimizedHistory(history, turn)
        : history;

      if (this.verbose && optimizedHistory.length < history.length) {
        console.log(`  [Context] History optimized: ${history.length} → ${optimizedHistory.length} messages`);
      }

      // Get model response using optimized history
      const response = await this.callConversation(optimizedHistory);

      if (this.verbose) {
        console.log(`Response: ${response.slice(0, 150)}...`);
      }

      // Check for context rot
      if (this.enableContextRotDetection) {
        const rotIndicators = this.contextRotDetector.analyzeResponse(response);
        if (rotIndicators.detected && this.verbose) {
          console.log(`  [Context Rot] Detected (confidence: ${rotIndicators.confidence}%)`);
          console.log(`  [Context Rot] Recommendation: ${rotIndicators.recommendation}`);
        }

        // Inject memory if context rot detected and we have memories
        if (rotIndicators.recommendation === 'inject_memory' ||
            rotIndicators.recommendation === 'summarize') {
          const memoryBank = this.contextManager.getMemoryBank();
          if (memoryBank.length > 0) {
            const memoryInjection = this.contextRotDetector.generateMemoryInjection(memoryBank);
            if (memoryInjection) {
              history.push({
                role: 'user',
                parts: [{ text: memoryInjection }],
              });
              if (this.verbose) {
                console.log(`  [Context Rot] Injected memory summary (${memoryBank.length} entries)`);
              }
            }
          }
        }
      }

      // Update adaptive compressor with estimated context usage
      const estimatedTokens = AdaptiveCompressor.estimateTokens(
        history.map(h => (h.parts || []).map(p => 'text' in p ? p.text : '').join('')).join('')
      );
      this.adaptiveCompressor.updateUsage(estimatedTokens);

      // Check for code block
      const hasCode = response.includes('```');
      let executionResult: string | null = null;
      let executionError: string | null = null;

      if (hasCode) {
        // Report executing phase
        reportProgress(turn, 'executing');

        if (this.verbose) {
          console.log('Executing code...');
        }

        const result = await this.executor.execute(response);
        if (result.success) {
          executionResult = result.output;
        } else {
          executionError = result.error || 'Unknown error';
        }

        if (this.verbose) {
          const preview = (executionResult || executionError || '').slice(0, 150);
          console.log(`Output: ${preview}...`);
        }

        // Report progress after execution (sub-LLM count may have changed)
        reportProgress(turn, 'analyzing');

        history.push({ role: 'model', parts: [{ text: response }] });
        history.push({
          role: 'user',
          parts: [{
            text: result.success
              ? `Result:\n\`\`\`\n${executionResult}\n\`\`\``
              : `Error:\n\`\`\`\n${executionError}\n\`\`\`\n\nPlease fix the code and try again.`,
          }],
        });
      } else {
        // No code, prompt for code or FINAL
        history.push({ role: 'model', parts: [{ text: response }] });
        history.push({
          role: 'user',
          parts: [{
            text: 'Please write Python code to analyze the codebase, or use FINAL("your answer") if you have the answer.',
          }],
        });
      }

      // Create turn record with current sub-LLM count
      const turnRecord: RLMTurn = {
        turn,
        response,
        code: hasCode ? this.extractCode(response) : null,
        executionResult,
        error: executionError,
        timestamp: Date.now(),
        subCallCount: this.executor.getSubCallCount(),
      };
      turns.push(turnRecord);

      // Register turn for context compression
      if (this.enableContextCompression) {
        this.contextManager.registerTurn(turn, response, executionResult, executionError);
      }

      if (onTurnComplete) {
        onTurnComplete(turnRecord);
      }

      // Check for final answer - but enforce minimum sub-LLM calls first
      const fileCount = Object.keys(context.files).length;
      const minSubCalls = getMinSubLLMCalls(fileCount);
      const currentSubCalls = this.executor.getSubCallCount();
      const needsMoreSubCalls = currentSubCalls < minSubCalls;

      if (this.executor.hasFinalAnswer()) {
        if (needsMoreSubCalls) {
          // Reject the final answer and ask for more sub-LLM analysis
          if (this.verbose) {
            console.log(`  [RLM] Insufficient sub-LLM calls: ${currentSubCalls}/${minSubCalls} required`);
          }
          this.executor.clearFinalAnswer();
          history.push({ role: 'model', parts: [{ text: response }] });
          history.push({
            role: 'user',
            parts: [{
              text: `⚠️ INSUFFICIENT ANALYSIS: You made only ${currentSubCalls} sub-LLM calls, but this codebase (${fileCount} files) requires at least ${minSubCalls} llm_query() calls for quality analysis.

Your FINAL() was rejected. You MUST use llm_query() to analyze more files before providing your final answer.

Suggested files to analyze with llm_query():
- Entry points (index.ts, main.ts, App.tsx)
- Config files (package.json, tsconfig.json)
- Core services or modules
- Type definitions

Example:
\`\`\`python
analysis = llm_query(f"Analyze this file for architecture patterns:\\n{file_index['src/index.ts'][:3000]}")
print(analysis)
\`\`\`

Make ${minSubCalls - currentSubCalls} more llm_query() calls, then call FINAL() with your comprehensive analysis.`,
            }],
          });
          continue;
        }
        return {
          success: true,
          answer: this.executor.getFinalAnswer(),
          turns,
          executionTimeMs: Date.now() - startTime,
          subCallCount: this.executor.getSubCallCount(),
          tokenSavings: this.enableContextCompression ? this.getTokenSavings() : undefined,
        };
      }

      // Check for FINAL in response text
      const finalMatch = response.match(/FINAL\s*\(\s*["'`]([\s\S]*?)["'`]\s*\)/);
      if (finalMatch) {
        if (needsMoreSubCalls) {
          // Reject and ask for more analysis
          if (this.verbose) {
            console.log(`  [RLM] Insufficient sub-LLM calls: ${currentSubCalls}/${minSubCalls} required`);
          }
          history.push({ role: 'model', parts: [{ text: response }] });
          history.push({
            role: 'user',
            parts: [{
              text: `⚠️ INSUFFICIENT ANALYSIS: You made only ${currentSubCalls} sub-LLM calls, but this codebase (${fileCount} files) requires at least ${minSubCalls} llm_query() calls.

Your FINAL() was rejected. Use llm_query() to analyze ${minSubCalls - currentSubCalls} more key files, then provide your final answer.`,
            }],
          });
          continue;
        }
        return {
          success: true,
          answer: finalMatch[1],
          turns,
          executionTimeMs: Date.now() - startTime,
          subCallCount: this.executor.getSubCallCount(),
          tokenSavings: this.enableContextCompression ? this.getTokenSavings() : undefined,
        };
      }
    }

    // Max turns exceeded
    return {
      success: false,
      answer: null,
      turns,
      executionTimeMs: Date.now() - startTime,
      subCallCount: this.executor.getSubCallCount(),
      error: `Max turns (${this.config.maxTurns}) exceeded. Partial output:\n${this.executor.getOutput()}`,
      tokenSavings: this.enableContextCompression ? this.getTokenSavings() : undefined,
    };
  }

  /**
   * Call model with conversation history using Gemini
   */
  private async callConversation(history: Content[]): Promise<string> {
    const ai = getAIClient();
    const modelsToTry = [this.config.rootModel];

    // Add fallback model if not already using it
    if (this.config.rootModel !== this.fallbackModel) {
      modelsToTry.push(this.fallbackModel);
    }

    let lastError: Error | null = null;

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: history,
          config: {
            temperature: 0.7,
            maxOutputTokens: 4096,
          },
        });

        // If using fallback and it worked, log it
        if (model !== this.config.rootModel && this.verbose) {
          console.log(`  [Info] Using fallback model: ${model}`);
        }

        return response.text || '';
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastError = new Error(`Model ${model}: ${message}`);

        // If it's a 500 error, try the next model
        if (message.includes('500') || message.includes('Internal')) {
          if (this.verbose) {
            console.log(`  [Warning] ${model} returned 500, trying fallback...`);
          }
          continue;
        }

        // For other errors, don't try fallback
        throw new Error(`Gemini API error (model: ${model}): ${message}`);
      }
    }

    throw new Error(`All models failed. Last error: ${lastError?.message}`);
  }

  /**
   * Call model with single prompt using Gemini with fallback
   */
  private async callModel(
    model: string,
    prompt: string,
    temperature = 0.3,
    maxTokens = 2048
  ): Promise<string> {
    const ai = getAIClient();
    const modelsToTry = [model];

    if (model !== this.fallbackModel) {
      modelsToTry.push(this.fallbackModel);
    }

    for (const currentModel of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: currentModel,
          contents: prompt,
          config: {
            temperature,
            maxOutputTokens: maxTokens,
          },
        });

        return response.text || '';
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('500') || message.includes('Internal')) {
          continue;
        }

        throw new Error(`Gemini API error (model: ${currentModel}): ${message}`);
      }
    }

    throw new Error('All models failed for sub-LLM call');
  }

  /**
   * Extract code from response
   */
  private extractCode(text: string): string | null {
    const match = text.match(/```(?:python|javascript|tool_code|js|ts)?\n([\s\S]*?)```/);
    return match ? match[1] : null;
  }

  /**
   * Get context manager for external access (e.g., getting memory bank)
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * Get token savings statistics
   */
  getTokenSavings(): { originalChars: number; compressedChars: number; savings: number } {
    return this.contextManager.getTokenSavingsEstimate();
  }

  /**
   * Execute multiple sub-LLM queries in parallel
   * Useful for analyzing multiple files concurrently
   */
  async executeParallelQueries(
    queries: Array<{ id: string; query: string }>
  ): Promise<Map<string, string>> {
    if (!this.enableParallelExecution) {
      // Fall back to sequential execution
      const results = new Map<string, string>();
      for (const { id, query } of queries) {
        const result = await this.callModel(this.config.subModel, query, 0.3, 2048);
        results.set(id, result);
      }
      return results;
    }

    const batchResult = await this.parallelExecutor.executeBatch(
      queries,
      (query) => this.callModel(this.config.subModel, query, 0.3, 2048)
    );

    if (this.verbose && batchResult.errors.size > 0) {
      console.log(`  [Parallel] ${queries.length} queries, ${batchResult.errors.size} errors`);
    }

    return batchResult.results;
  }

  /**
   * Get adaptive compression metrics
   */
  getCompressionMetrics() {
    return {
      level: this.adaptiveCompressor.getCompressionLevel(),
      metrics: this.adaptiveCompressor.getMetrics(),
    };
  }

  /**
   * Get context rot detection statistics
   */
  getContextRotStats() {
    return this.contextRotDetector.getStats();
  }

  /**
   * Get iterative refinement history
   */
  getRefinementHistory() {
    return this.iterativeRefiner.getHistory();
  }

  /**
   * Evaluate the quality of an analysis result
   */
  evaluateResultQuality(result: string, query: string): number {
    return this.iterativeRefiner.evaluateQuality(result, query);
  }

  /**
   * Get selective attention manager for external configuration
   */
  getSelectiveAttention(): SelectiveAttention {
    return this.selectiveAttention;
  }

  /**
   * Get parallel executor for external configuration
   */
  getParallelExecutor(): ParallelExecutor {
    return this.parallelExecutor;
  }
}
