/**
 * RLM Analyzer Type Definitions
 * Based on MIT CSAIL Recursive Language Models research (arXiv:2512.24601v1)
 */

import { getDefaultModel } from './models.js';
import type { ProviderName } from './providers/types.js';

/** Analysis types supported by the analyzer */
export type AnalysisType = 'architecture' | 'dependencies' | 'security' | 'performance' | 'refactor' | 'summary' | 'custom';

export interface RLMConfig {
  /** Root model for orchestration (default: gemini-3-flash-preview) */
  rootModel: string;
  /** Sub-model for recursive calls (default: gemini-3-flash-preview) */
  subModel: string;
  /** Maximum recursion depth for sub-LLM calls */
  maxRecursionDepth: number;
  /** Maximum conversation turns before forcing completion */
  maxTurns: number;
  /** Timeout in milliseconds for entire analysis */
  timeoutMs: number;
  /** Maximum sub-LLM calls per session */
  maxSubCalls: number;
  /** Analysis mode */
  mode: 'code-analysis' | 'document-qa' | 'education';
}

export interface RLMContext {
  /** Files loaded as environment variables */
  files: Record<string, string>;
  /** Additional context variables */
  variables: Record<string, unknown>;
  /** Analysis mode */
  mode: RLMConfig['mode'];
}

export interface RLMTurn {
  /** Turn number */
  turn: number;
  /** Model's response text */
  response: string;
  /** Code extracted from response */
  code: string | null;
  /** Execution result */
  executionResult: string | null;
  /** Error if any */
  error: string | null;
  /** Timestamp */
  timestamp: number;
  /** Current sub-LLM call count (for progress tracking) */
  subCallCount?: number;
}

/** Progress update for real-time feedback */
export interface RLMProgress {
  /** Current turn number */
  turn: number;
  /** Total sub-LLM calls made so far */
  subCallCount: number;
  /** Current phase of analysis */
  phase: 'initializing' | 'analyzing' | 'executing' | 'sub-llm' | 'finalizing';
  /** Elapsed time in milliseconds */
  elapsedMs: number;
}

/** Token savings statistics from context compression */
export interface TokenSavings {
  /** Estimated original character count */
  originalChars: number;
  /** Compressed character count */
  compressedChars: number;
  /** Savings percentage (0-100) */
  savings: number;
}

export interface RLMResult {
  /** Whether analysis completed successfully */
  success: boolean;
  /** Final answer extracted via FINAL() marker */
  answer: string | null;
  /** All conversation turns */
  turns: RLMTurn[];
  /** Total execution time in ms */
  executionTimeMs: number;
  /** Number of sub-LLM calls made */
  subCallCount: number;
  /** Error message if failed */
  error?: string;
  /** Token savings from context compression (if enabled) */
  tokenSavings?: TokenSavings;
}

export interface CodeAnalysisOptions {
  /** Directory to analyze */
  directory: string;
  /** File patterns to include (glob) */
  include?: string[];
  /** File patterns to exclude (glob) */
  exclude?: string[];
  /** Custom query for analysis */
  query?: string;
  /** Analysis type */
  analysisType?: AnalysisType;
  /** Callback for turn updates */
  onTurnComplete?: (turn: RLMTurn) => void;
  /** Callback for progress updates (called frequently with current stats) */
  onProgress?: (progress: RLMProgress) => void;
  /** Verbose output */
  verbose?: boolean;
  /** Model to use (alias or full model ID) */
  model?: string;
  /** LLM provider to use (default: gemini) */
  provider?: ProviderName;
  /** Output file path for saving results (e.g., 'rlm-context.md') */
  outputFile?: string;
  /** Maximum turns before forcing completion (default: auto-calculated based on codebase size) */
  maxTurns?: number;
  /** Enable web grounding to verify package versions in security recommendations (default: false) */
  enableWebGrounding?: boolean;
}

export interface CodeAnalysisResult extends RLMResult {
  /** Files that were analyzed */
  filesAnalyzed: string[];
  /** Analysis type performed */
  analysisType: AnalysisType;
}

export interface ExecutorResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Output from execution */
  output: string;
  /** Error message if failed */
  error?: string;
}

export interface SubLLMOptions {
  /** Model to use */
  model?: string;
  /** Temperature for generation */
  temperature?: number;
  /** Maximum tokens in response */
  maxTokens?: number;
}

/** Markers for extracting final answers */
export const FINAL_MARKERS = {
  FINAL: 'FINAL(',
  FINAL_VAR: 'FINAL_VAR(',
} as const;

/**
 * Get default RLM configuration with dynamically resolved models
 * This function respects the model priority chain:
 * 1. Environment variables (RLM_DEFAULT_MODEL)
 * 2. Config file (~/.rlm-analyzer/config.json)
 * 3. Built-in defaults
 *
 * @param modelOverride - Optional model to use instead of resolved default
 * @returns RLMConfig with resolved model settings
 */
export function getDefaultRLMConfig(modelOverride?: string): RLMConfig {
  const model = modelOverride || getDefaultModel();
  return {
    rootModel: model,
    subModel: model,
    maxRecursionDepth: 3,
    maxTurns: 10,
    timeoutMs: 300000, // 5 minutes
    maxSubCalls: 15,
    mode: 'code-analysis',
  };
}

/**
 * @deprecated Use `getDefaultRLMConfig()` instead for dynamic model resolution.
 * This static constant uses hardcoded model IDs and won't respect
 * environment variables or config file settings.
 */
export const DEFAULT_CONFIG: RLMConfig = {
  rootModel: 'gemini-3-flash-preview',
  subModel: 'gemini-3-flash-preview',
  maxRecursionDepth: 3,
  maxTurns: 10,
  timeoutMs: 300000, // 5 minutes
  maxSubCalls: 15,
  mode: 'code-analysis',
};

/** File extensions to analyze by default */
export const CODE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw',
  '.java', '.kt', '.scala',
  '.go',
  '.rs',
  '.c', '.cpp', '.cc', '.h', '.hpp',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.vue', '.svelte',
  '.json', '.yaml', '.yml', '.toml',
  '.md', '.mdx',
  '.sql',
  '.sh', '.bash', '.zsh',
  '.dockerfile', '.docker-compose.yml',
];

/** Directories to ignore by default */
export const IGNORE_DIRS = [
  'node_modules',
  'dist',
  'build',
  '.git',
  '.svn',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'env',
  '.env',
  'vendor',
  'target',
  '.next',
  '.nuxt',
  '.output',
  '.cache',
];
