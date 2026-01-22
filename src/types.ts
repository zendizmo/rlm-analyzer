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
  /** Use structural index cache for faster subsequent runs (default: true) */
  useCache?: boolean;
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
  // JavaScript/TypeScript
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  // Python
  '.py', '.pyw',
  // JVM
  '.java', '.kt', '.scala', '.groovy',
  // Systems
  '.go', '.rs', '.c', '.cpp', '.cc', '.h', '.hpp',
  // .NET
  '.cs', '.fs', '.vb',
  // Scripting
  '.rb', '.php', '.lua', '.pl', '.pm',
  // Mobile
  '.swift', '.m', '.mm',
  // Frontend frameworks
  '.vue', '.svelte', '.astro',
  // Data/Config
  '.json', '.yaml', '.yml', '.toml', '.xml',
  // Documentation
  '.md', '.mdx', '.rst',
  // Database
  '.sql', '.prisma',
  // API/Schema definitions
  '.graphql', '.gql', '.proto',
  // Infrastructure as Code
  '.tf', '.tfvars', '.hcl',
  // Shell/Scripts
  '.sh', '.bash', '.zsh', '.ps1',
  // Container/DevOps
  '.dockerfile',
  // Environment templates (not .env itself for security)
  '.env.example', '.env.sample', '.env.template',
];

/** File names to include regardless of extension */
export const INCLUDE_FILENAMES = [
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Makefile',
  'Jenkinsfile',
  'Vagrantfile',
  '.gitignore',
  '.dockerignore',
  '.eslintrc',
  '.prettierrc',
  'tsconfig.json',
  'package.json',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'CMakeLists.txt',
];

// ============================================================================
// Structural Index Types (for caching and dependency analysis)
// ============================================================================

/** File metadata in the structural index */
export interface FileIndexEntry {
  /** Relative path from project root */
  path: string;
  /** SHA-256 hash of file content */
  hash: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  mtime: number;
  /** Detected imports/dependencies */
  imports: string[];
  /** Detected exports */
  exports: string[];
  /** File extension */
  extension: string;
  /** Whether file was chunked due to size */
  chunked: boolean;
  /** Number of chunks if chunked */
  chunkCount?: number;
}

/** Dependency edge in the graph */
export interface DependencyEdge {
  /** Source file (importer) */
  from: string;
  /** Target file (imported) */
  to: string;
  /** Type of import */
  type: 'import' | 'require' | 'include' | 'from';
}

/** Cluster of related files */
export interface FileCluster {
  /** Cluster identifier */
  id: string;
  /** Files in this cluster */
  files: string[];
  /** Entry point file(s) */
  entryPoints: string[];
  /** Total size of cluster in bytes */
  totalSize: number;
  /** Cluster type */
  type: 'module' | 'feature' | 'utility' | 'config' | 'test';
}

/** Structural index for a project */
export interface StructuralIndex {
  /** Version of the index format */
  version: string;
  /** Project root path */
  projectRoot: string;
  /** Index creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** File index entries */
  files: Record<string, FileIndexEntry>;
  /** Dependency edges */
  dependencies: DependencyEdge[];
  /** File clusters for grouped analysis */
  clusters: FileCluster[];
  /** Project metadata */
  metadata: {
    /** Total file count */
    fileCount: number;
    /** Total size in bytes */
    totalSize: number;
    /** Detected languages */
    languages: string[];
    /** Detected frameworks */
    frameworks: string[];
    /** Package manager detected */
    packageManager?: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'cargo' | 'go' | 'maven' | 'gradle';
  };
}

/** Options for structural indexing */
export interface StructuralIndexOptions {
  /** Force rebuild even if cache exists */
  force?: boolean;
  /** Maximum file size before chunking (default: 100KB) */
  maxFileSize?: number;
  /** Chunk size for large files (default: 50KB) */
  chunkSize?: number;
  /** Enable dependency graph building */
  buildDependencyGraph?: boolean;
  /** Enable file clustering */
  enableClustering?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

/** Large file chunk */
export interface FileChunk {
  /** Chunk index */
  index: number;
  /** Total chunks for this file */
  total: number;
  /** Start line number */
  startLine: number;
  /** End line number */
  endLine: number;
  /** Chunk content */
  content: string;
  /** Chunk summary (generated by LLM) */
  summary?: string;
}

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
