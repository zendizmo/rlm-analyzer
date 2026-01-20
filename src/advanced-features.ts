/**
 * Advanced RLM Features
 * Implements additional techniques from the RLM paper (arXiv:2512.24601)
 *
 * Features:
 * 1. Parallel Sub-Agent Execution - Run multiple llm_query calls concurrently
 * 2. Adaptive Compression - Dynamically adjust based on context usage
 * 3. Context Rot Detection - Detect and recover from context degradation
 * 4. Selective Attention - Dynamic context filtering based on relevance
 * 5. Iterative Refinement - Multi-pass analysis for quality improvement
 */

import type { MemoryEntry } from './context-manager.js';

// ============================================================================
// 1. PARALLEL SUB-AGENT EXECUTION
// ============================================================================

/** Configuration for parallel execution */
export interface ParallelExecutionConfig {
  /** Maximum concurrent sub-LLM calls */
  maxConcurrent: number;
  /** Timeout per individual call (ms) */
  callTimeout: number;
  /** Whether to fail fast on first error */
  failFast: boolean;
  /** Retry count for failed calls */
  retryCount: number;
}

/** Result from a parallel batch execution */
export interface ParallelBatchResult {
  /** Results indexed by query ID */
  results: Map<string, string>;
  /** Errors indexed by query ID */
  errors: Map<string, Error>;
  /** Total execution time */
  totalTimeMs: number;
  /** Individual timing per query */
  timings: Map<string, number>;
}

/** Default parallel execution config */
const DEFAULT_PARALLEL_CONFIG: ParallelExecutionConfig = {
  maxConcurrent: 3,
  callTimeout: 30000,
  failFast: false,
  retryCount: 1,
};

/**
 * Parallel Sub-Agent Executor
 * Manages concurrent execution of sub-LLM queries
 */
export class ParallelExecutor {
  private config: ParallelExecutionConfig;

  constructor(config: Partial<ParallelExecutionConfig> = {}) {
    this.config = { ...DEFAULT_PARALLEL_CONFIG, ...config };
  }

  /**
   * Execute multiple queries in parallel with concurrency control
   */
  async executeBatch(
    queries: Array<{ id: string; query: string }>,
    executor: (query: string) => Promise<string>
  ): Promise<ParallelBatchResult> {
    const startTime = Date.now();
    const results = new Map<string, string>();
    const errors = new Map<string, Error>();
    const timings = new Map<string, number>();

    // Process in batches respecting maxConcurrent
    const batches: Array<Array<{ id: string; query: string }>> = [];
    for (let i = 0; i < queries.length; i += this.config.maxConcurrent) {
      batches.push(queries.slice(i, i + this.config.maxConcurrent));
    }

    for (const batch of batches) {
      const batchPromises = batch.map(async ({ id, query }) => {
        const queryStart = Date.now();
        try {
          const result = await this.executeWithRetry(query, executor);
          results.set(id, result);
          timings.set(id, Date.now() - queryStart);
        } catch (error) {
          errors.set(id, error instanceof Error ? error : new Error(String(error)));
          timings.set(id, Date.now() - queryStart);
          if (this.config.failFast) {
            throw error;
          }
        }
      });

      await Promise.all(batchPromises);
    }

    return {
      results,
      errors,
      totalTimeMs: Date.now() - startTime,
      timings,
    };
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry(
    query: string,
    executor: (query: string) => Promise<string>
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retryCount; attempt++) {
      try {
        return await Promise.race([
          executor(query),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout')), this.config.callTimeout)
          ),
        ]);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.config.retryCount) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error('Unknown error');
  }

  /**
   * Get optimal batch size based on query complexity
   */
  static getOptimalBatchSize(queries: string[], maxTokensPerBatch = 10000): number {
    // Estimate tokens (rough: 4 chars per token)
    const avgQueryLength = queries.reduce((sum, q) => sum + q.length, 0) / queries.length;
    const estimatedTokensPerQuery = avgQueryLength / 4;
    return Math.max(1, Math.floor(maxTokensPerBatch / estimatedTokensPerQuery));
  }
}

// ============================================================================
// 2. ADAPTIVE COMPRESSION
// ============================================================================

/** Context usage metrics */
export interface ContextUsageMetrics {
  /** Estimated tokens used */
  tokensUsed: number;
  /** Maximum tokens available */
  maxTokens: number;
  /** Usage percentage (0-100) */
  usagePercent: number;
  /** Memory bank size */
  memoryBankSize: number;
  /** Compressed turns count */
  compressedTurnsCount: number;
}

/** Adaptive compression configuration */
export interface AdaptiveCompressionConfig {
  /** Target context usage percentage (0-100) */
  targetUsagePercent: number;
  /** Usage threshold to trigger aggressive compression */
  aggressiveThreshold: number;
  /** Usage threshold to trigger emergency compression */
  emergencyThreshold: number;
  /** Minimum result length even under emergency compression */
  minResultLength: number;
}

/** Default adaptive compression config */
const DEFAULT_ADAPTIVE_CONFIG: AdaptiveCompressionConfig = {
  targetUsagePercent: 70,
  aggressiveThreshold: 80,
  emergencyThreshold: 90,
  minResultLength: 500,
};

/**
 * Adaptive Compression Manager
 * Dynamically adjusts compression based on context usage
 */
export class AdaptiveCompressor {
  private config: AdaptiveCompressionConfig;
  private maxContextTokens: number;
  private currentUsage = 0;

  constructor(
    maxContextTokens = 100000, // Default for Gemini 1.5 Flash
    config: Partial<AdaptiveCompressionConfig> = {}
  ) {
    this.maxContextTokens = maxContextTokens;
    this.config = { ...DEFAULT_ADAPTIVE_CONFIG, ...config };
  }

  /**
   * Update current context usage
   */
  updateUsage(estimatedTokens: number): void {
    this.currentUsage = estimatedTokens;
  }

  /**
   * Get current context metrics
   */
  getMetrics(): ContextUsageMetrics {
    return {
      tokensUsed: this.currentUsage,
      maxTokens: this.maxContextTokens,
      usagePercent: Math.round((this.currentUsage / this.maxContextTokens) * 100),
      memoryBankSize: 0, // Will be set by context manager
      compressedTurnsCount: 0, // Will be set by context manager
    };
  }

  /**
   * Get adaptive compression level based on current usage
   */
  getCompressionLevel(): 'none' | 'normal' | 'aggressive' | 'emergency' {
    const usagePercent = (this.currentUsage / this.maxContextTokens) * 100;

    if (usagePercent >= this.config.emergencyThreshold) {
      return 'emergency';
    }
    if (usagePercent >= this.config.aggressiveThreshold) {
      return 'aggressive';
    }
    if (usagePercent >= this.config.targetUsagePercent) {
      return 'normal';
    }
    return 'none';
  }

  /**
   * Get dynamic max result length based on compression level
   */
  getMaxResultLength(baseLength: number): number {
    const level = this.getCompressionLevel();

    switch (level) {
      case 'emergency':
        return Math.max(this.config.minResultLength, Math.floor(baseLength * 0.3));
      case 'aggressive':
        return Math.max(this.config.minResultLength, Math.floor(baseLength * 0.5));
      case 'normal':
        return Math.max(this.config.minResultLength, Math.floor(baseLength * 0.75));
      default:
        return baseLength;
    }
  }

  /**
   * Compress content adaptively based on current context usage
   */
  compressAdaptively(content: string, baseMaxLength: number): string {
    const maxLength = this.getMaxResultLength(baseMaxLength);

    if (content.length <= maxLength) {
      return content;
    }

    const level = this.getCompressionLevel();
    const lines = content.split('\n');
    const importantLines: string[] = [];

    // Priority-based extraction
    for (const line of lines) {
      const trimmed = line.trim();

      // Always keep headers
      if (trimmed.startsWith('#')) {
        importantLines.push(line);
        continue;
      }

      // Keep based on compression level
      if (level === 'emergency') {
        // Only keep headers and critical markers
        if (trimmed.startsWith('**') || trimmed.includes('CRITICAL') ||
            trimmed.includes('ERROR') || trimmed.includes('WARNING')) {
          importantLines.push(line);
        }
      } else if (level === 'aggressive') {
        // Keep bullets and numbered items (limited)
        if ((trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed))
            && importantLines.length < 20) {
          importantLines.push(line);
        }
      } else {
        // Normal: keep more content
        if ((trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed))
            && importantLines.length < 40) {
          importantLines.push(line);
        }
      }
    }

    let result = importantLines.join('\n');

    if (result.length > maxLength) {
      result = result.slice(0, maxLength - 30) + '\n[...compressed...]';
    }

    return result;
  }

  /**
   * Estimate tokens from text (rough approximation)
   */
  static estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }
}

// ============================================================================
// 3. CONTEXT ROT DETECTION
// ============================================================================

/** Context rot indicators */
export interface ContextRotIndicators {
  /** Whether context rot is detected */
  detected: boolean;
  /** Confidence level (0-100) */
  confidence: number;
  /** Specific indicators found */
  indicators: string[];
  /** Recommended action */
  recommendation: 'none' | 'inject_memory' | 'summarize' | 'restart';
}

/** Patterns indicating context rot */
const CONTEXT_ROT_PATTERNS = [
  /as (i |we )?(mentioned|discussed|noted) (earlier|before|previously)/i,
  /i('m| am) not sure what/i,
  /what (was|were) (we|you) (looking|asking)/i,
  /can you remind me/i,
  /i don't (have|see) (context|information) about/i,
  /let me start (over|again|fresh)/i,
  /i('ve| have) lost track/i,
  /refresh my (memory|understanding)/i,
  /what (file|code|function) (are|were) we/i,
];

/** Patterns indicating good context retention */
const CONTEXT_RETENTION_PATTERNS = [
  /based on (the|my) (previous|earlier) analysis/i,
  /as (we|i) (found|discovered|identified)/i,
  /continuing (from|with) (the|our)/i,
  /building on (the|our) (findings|analysis)/i,
];

/**
 * Context Rot Detector
 * Monitors for signs of context degradation
 */
export class ContextRotDetector {
  private recentResponses: string[] = [];
  private maxHistory = 5;
  private memoryReferenceCount = 0;
  private rotIndicatorCount = 0;

  /**
   * Analyze a response for context rot indicators
   */
  analyzeResponse(response: string): ContextRotIndicators {
    this.recentResponses.push(response);
    if (this.recentResponses.length > this.maxHistory) {
      this.recentResponses.shift();
    }

    const indicators: string[] = [];
    let rotScore = 0;
    let retentionScore = 0;

    // Check for rot patterns
    for (const pattern of CONTEXT_ROT_PATTERNS) {
      if (pattern.test(response)) {
        indicators.push(`Rot pattern: ${pattern.source.slice(0, 30)}...`);
        rotScore += 20;
        this.rotIndicatorCount++;
      }
    }

    // Check for retention patterns
    for (const pattern of CONTEXT_RETENTION_PATTERNS) {
      if (pattern.test(response)) {
        retentionScore += 15;
        this.memoryReferenceCount++;
      }
    }

    // Check for repetitive questioning
    if (this.recentResponses.length >= 3) {
      const questionPatterns = this.recentResponses.map(r =>
        (r.match(/\?/g) || []).length
      );
      const avgQuestions = questionPatterns.reduce((a, b) => a + b, 0) / questionPatterns.length;
      if (avgQuestions > 3) {
        indicators.push('High question frequency (possible confusion)');
        rotScore += 15;
      }
    }

    // Check for lack of specific references
    if (!response.includes('file_index') && !response.includes('llm_query') &&
        response.length > 500 && !response.includes('FINAL')) {
      indicators.push('No code/file references in substantial response');
      rotScore += 10;
    }

    // Calculate net score
    const netScore = Math.max(0, rotScore - retentionScore);
    const confidence = Math.min(100, netScore);

    // Determine recommendation
    let recommendation: ContextRotIndicators['recommendation'] = 'none';
    if (confidence >= 60) {
      recommendation = 'restart';
    } else if (confidence >= 40) {
      recommendation = 'summarize';
    } else if (confidence >= 20) {
      recommendation = 'inject_memory';
    }

    return {
      detected: confidence >= 20,
      confidence,
      indicators,
      recommendation,
    };
  }

  /**
   * Generate a memory injection prompt to combat context rot
   */
  generateMemoryInjection(memoryBank: MemoryEntry[]): string {
    if (memoryBank.length === 0) {
      return '';
    }

    const topMemories = memoryBank
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10);

    const lines = [
      '## 🧠 Memory Refresh (Key Findings So Far)',
      '',
      'To help maintain context, here are the key findings from our analysis:',
      '',
    ];

    for (const memory of topMemories) {
      lines.push(`- **[${memory.type}]** ${memory.content.slice(0, 150)}`);
    }

    lines.push('');
    lines.push('Continue the analysis with these findings in mind.');

    return lines.join('\n');
  }

  /**
   * Reset the detector state
   */
  reset(): void {
    this.recentResponses = [];
    this.memoryReferenceCount = 0;
    this.rotIndicatorCount = 0;
  }

  /**
   * Get detection statistics
   */
  getStats(): { rotIndicators: number; memoryReferences: number; ratio: number } {
    const total = this.rotIndicatorCount + this.memoryReferenceCount;
    return {
      rotIndicators: this.rotIndicatorCount,
      memoryReferences: this.memoryReferenceCount,
      ratio: total > 0 ? this.memoryReferenceCount / total : 1,
    };
  }
}

// ============================================================================
// 4. SELECTIVE ATTENTION
// ============================================================================

/** Attention weights for different content types */
export interface AttentionWeights {
  /** Weight for file analysis results */
  fileAnalysis: number;
  /** Weight for architecture patterns */
  patterns: number;
  /** Weight for dependencies */
  dependencies: number;
  /** Weight for issues/errors */
  issues: number;
  /** Weight for summaries */
  summaries: number;
}

/** Default attention weights */
const DEFAULT_ATTENTION_WEIGHTS: AttentionWeights = {
  fileAnalysis: 1.0,
  patterns: 1.2,
  dependencies: 0.8,
  issues: 1.5,
  summaries: 0.7,
};

/**
 * Selective Attention Manager
 * Dynamically filters and prioritizes context based on relevance
 */
export class SelectiveAttention {
  private weights: AttentionWeights;
  private queryContext: string = '';

  constructor(weights: Partial<AttentionWeights> = {}) {
    this.weights = { ...DEFAULT_ATTENTION_WEIGHTS, ...weights };
  }

  /**
   * Set the current query context for relevance scoring
   */
  setQueryContext(query: string): void {
    this.queryContext = query.toLowerCase();
  }

  /**
   * Adjust weights based on query type
   */
  adjustWeightsForQuery(query: string): void {
    const lowerQuery = query.toLowerCase();

    // Security-focused query
    if (lowerQuery.includes('security') || lowerQuery.includes('vulnerab') ||
        lowerQuery.includes('auth') || lowerQuery.includes('injection')) {
      this.weights.issues = 2.0;
      this.weights.patterns = 0.8;
    }

    // Architecture-focused query
    if (lowerQuery.includes('architecture') || lowerQuery.includes('structure') ||
        lowerQuery.includes('design') || lowerQuery.includes('pattern')) {
      this.weights.patterns = 2.0;
      this.weights.fileAnalysis = 1.2;
    }

    // Dependency-focused query
    if (lowerQuery.includes('depend') || lowerQuery.includes('import') ||
        lowerQuery.includes('package') || lowerQuery.includes('module')) {
      this.weights.dependencies = 2.0;
    }
  }

  /**
   * Score a memory entry based on current attention weights and query relevance
   */
  scoreMemory(memory: MemoryEntry): number {
    let score = memory.importance;

    // Apply type-based weight
    const typeWeight = this.getTypeWeight(memory.type);
    score *= typeWeight;

    // Apply query relevance
    if (this.queryContext) {
      const relevance = this.calculateRelevance(memory.content);
      score *= (1 + relevance);
    }

    return score;
  }

  /**
   * Get weight for a memory type
   */
  private getTypeWeight(type: MemoryEntry['type']): number {
    switch (type) {
      case 'file_analysis':
        return this.weights.fileAnalysis;
      case 'pattern':
        return this.weights.patterns;
      case 'dependency':
        return this.weights.dependencies;
      case 'issue':
        return this.weights.issues;
      case 'summary':
        return this.weights.summaries;
      default:
        return 1.0;
    }
  }

  /**
   * Calculate relevance of content to current query
   */
  private calculateRelevance(content: string): number {
    if (!this.queryContext) return 0;

    const contentLower = content.toLowerCase();
    const queryWords = this.queryContext.split(/\s+/).filter(w => w.length > 3);

    let matches = 0;
    for (const word of queryWords) {
      if (contentLower.includes(word)) {
        matches++;
      }
    }

    return queryWords.length > 0 ? matches / queryWords.length : 0;
  }

  /**
   * Filter and sort memories by attention score
   */
  filterByAttention(memories: MemoryEntry[], maxCount: number): MemoryEntry[] {
    const scored = memories.map(m => ({
      memory: m,
      score: this.scoreMemory(m),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, maxCount).map(s => s.memory);
  }

  /**
   * Build an attention-weighted context summary
   */
  buildAttentionContext(memories: MemoryEntry[], maxTokens: number): string {
    const filtered = this.filterByAttention(memories, 20);
    const lines: string[] = ['## Relevant Context (Attention-Filtered)', ''];

    let estimatedTokens = 20; // Header overhead

    for (const memory of filtered) {
      const line = `- [${memory.type}] ${memory.content.slice(0, 200)}`;
      const lineTokens = Math.ceil(line.length / 4);

      if (estimatedTokens + lineTokens > maxTokens) {
        break;
      }

      lines.push(line);
      estimatedTokens += lineTokens;
    }

    return lines.join('\n');
  }

  /**
   * Reset weights to defaults
   */
  resetWeights(): void {
    this.weights = { ...DEFAULT_ATTENTION_WEIGHTS };
  }
}

// ============================================================================
// 5. ITERATIVE REFINEMENT
// ============================================================================

/** Refinement pass configuration */
export interface RefinementConfig {
  /** Maximum refinement passes */
  maxPasses: number;
  /** Quality threshold to stop refinement (0-100) */
  qualityThreshold: number;
  /** Minimum improvement required to continue (percentage) */
  minImprovement: number;
  /** Enable self-critique */
  enableSelfCritique: boolean;
}

/** Result of a refinement pass */
export interface RefinementPassResult {
  /** Pass number */
  pass: number;
  /** Quality score for this pass */
  qualityScore: number;
  /** Improvements made */
  improvements: string[];
  /** Issues found */
  issuesFound: string[];
  /** Whether refinement should continue */
  shouldContinue: boolean;
}

/** Default refinement config */
const DEFAULT_REFINEMENT_CONFIG: RefinementConfig = {
  maxPasses: 3,
  qualityThreshold: 85,
  minImprovement: 5,
  enableSelfCritique: true,
};

/**
 * Iterative Refinement Manager
 * Manages multi-pass analysis for quality improvement
 */
export class IterativeRefiner {
  private config: RefinementConfig;
  private passHistory: RefinementPassResult[] = [];

  constructor(config: Partial<RefinementConfig> = {}) {
    this.config = { ...DEFAULT_REFINEMENT_CONFIG, ...config };
  }

  /**
   * Evaluate the quality of an analysis result
   */
  evaluateQuality(result: string, query: string): number {
    let score = 50; // Base score

    // Length check (not too short, not too long)
    const length = result.length;
    if (length > 500 && length < 10000) score += 10;
    if (length > 1000 && length < 5000) score += 5;

    // Structure check (has headers, bullets)
    if (result.includes('##')) score += 10;
    if (result.includes('- ') || result.includes('* ')) score += 5;
    if (/\d+\./.test(result)) score += 5;

    // Query relevance
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const resultLower = result.toLowerCase();
    let queryMatches = 0;
    for (const word of queryWords) {
      if (resultLower.includes(word)) queryMatches++;
    }
    score += Math.min(15, (queryMatches / Math.max(1, queryWords.length)) * 20);

    // Code references
    if (result.includes('```')) score += 5;
    if (result.includes('.ts') || result.includes('.js') || result.includes('.py')) score += 5;

    // Specificity check (contains specific file/function names)
    if (/`[a-zA-Z_][a-zA-Z0-9_]*`/.test(result)) score += 5;
    if (/[a-zA-Z]+\.(ts|js|py|tsx|jsx)/.test(result)) score += 5;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Generate a self-critique prompt
   */
  generateCritiquePrompt(result: string, query: string): string {
    return `Review this analysis and identify areas for improvement:

**Original Query:** ${query}

**Current Analysis:**
${result.slice(0, 2000)}${result.length > 2000 ? '...[truncated]' : ''}

**Critique the analysis for:**
1. Completeness - Did it address all aspects of the query?
2. Accuracy - Are the findings well-supported by the code?
3. Specificity - Are there concrete file/function references?
4. Actionability - Are recommendations clear and practical?
5. Gaps - What important aspects were missed?

Provide specific improvements needed.`;
  }

  /**
   * Generate a refinement prompt based on critique
   */
  generateRefinementPrompt(
    originalResult: string,
    critique: string,
    query: string
  ): string {
    return `Improve the analysis based on this critique:

**Original Query:** ${query}

**Previous Analysis Summary:**
${originalResult.slice(0, 1500)}

**Critique/Improvements Needed:**
${critique.slice(0, 1000)}

**Instructions:**
1. Address each point in the critique
2. Add more specific file/code references
3. Ensure completeness for all query aspects
4. Keep the response focused and well-structured

Provide the improved analysis:`;
  }

  /**
   * Determine if refinement should continue
   */
  shouldContinueRefinement(
    currentScore: number,
    previousScore: number | null
  ): { shouldContinue: boolean; reason: string } {
    // Check if we've reached max passes
    if (this.passHistory.length >= this.config.maxPasses) {
      return { shouldContinue: false, reason: 'Max passes reached' };
    }

    // Check if quality threshold met
    if (currentScore >= this.config.qualityThreshold) {
      return { shouldContinue: false, reason: 'Quality threshold met' };
    }

    // Check for minimum improvement
    if (previousScore !== null) {
      const improvement = currentScore - previousScore;
      if (improvement < this.config.minImprovement) {
        return { shouldContinue: false, reason: 'Insufficient improvement' };
      }
    }

    return { shouldContinue: true, reason: 'Refinement beneficial' };
  }

  /**
   * Record a refinement pass
   */
  recordPass(
    qualityScore: number,
    improvements: string[],
    issuesFound: string[]
  ): RefinementPassResult {
    const previousScore = this.passHistory.length > 0
      ? this.passHistory[this.passHistory.length - 1].qualityScore
      : null;

    const { shouldContinue } = this.shouldContinueRefinement(qualityScore, previousScore);

    const passResult: RefinementPassResult = {
      pass: this.passHistory.length + 1,
      qualityScore,
      improvements,
      issuesFound,
      shouldContinue,
    };

    this.passHistory.push(passResult);
    return passResult;
  }

  /**
   * Get refinement history
   */
  getHistory(): RefinementPassResult[] {
    return [...this.passHistory];
  }

  /**
   * Get overall improvement
   */
  getOverallImprovement(): number {
    if (this.passHistory.length < 2) return 0;
    const first = this.passHistory[0].qualityScore;
    const last = this.passHistory[this.passHistory.length - 1].qualityScore;
    return last - first;
  }

  /**
   * Reset for new analysis
   */
  reset(): void {
    this.passHistory = [];
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  DEFAULT_PARALLEL_CONFIG,
  DEFAULT_ADAPTIVE_CONFIG,
  DEFAULT_REFINEMENT_CONFIG,
  DEFAULT_ATTENTION_WEIGHTS,
  CONTEXT_ROT_PATTERNS,
  CONTEXT_RETENTION_PATTERNS,
};
