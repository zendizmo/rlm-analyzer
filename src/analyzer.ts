/**
 * Code Analysis High-Level API
 * Provides easy-to-use functions for common analysis tasks
 *
 * Features:
 * - Structural indexing with caching for faster subsequent runs
 * - Dependency graph for cross-file analysis
 * - Large file chunking to avoid missing important code
 * - Smart analysis ordering based on file clusters
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  CodeAnalysisOptions,
  CodeAnalysisResult,
  StructuralIndex,
} from './types.js';
import { CODE_EXTENSIONS, INCLUDE_FILENAMES, IGNORE_DIRS, isFlutterGeneratedFile } from './types.js';
import { RLMOrchestrator } from './orchestrator.js';
import { getAnalysisPrompt } from './prompts.js';
import { verifySecurityRecommendations, appendGroundingSources } from './grounding.js';
import {
  buildStructuralIndex,
  updateStructuralIndex,
  getAnalysisPriority,
  clearCache,
} from './structural-index.js';
import {
  processLargeFile,
  createLargeFileSummary,
} from './file-chunker.js';

/** Default maximum file size in bytes (100KB) */
export const DEFAULT_MAX_FILE_SIZE = 100_000;

/** Large file threshold - files above this get chunked (200KB) */
const LARGE_FILE_THRESHOLD = 200_000;

/** Default analysis type when not specified */
export const DEFAULT_ANALYSIS_TYPE = 'summary' as const;

/**
 * Calculate smart max turns based on file count
 * Larger codebases need more turns to fully analyze
 */
function calculateMaxTurns(fileCount: number): number {
  if (fileCount >= 200) return 25;  // Very large codebase
  if (fileCount >= 100) return 20;  // Large codebase
  if (fileCount >= 50) return 15;   // Medium codebase
  if (fileCount >= 20) return 12;   // Small codebase
  return 10;                         // Tiny codebase
}

/**
 * Calculate timeout based on file count
 * Larger codebases need more time
 */
function calculateTimeout(fileCount: number): number {
  if (fileCount >= 200) return 900000;  // 15 minutes
  if (fileCount >= 100) return 600000;  // 10 minutes
  if (fileCount >= 50) return 450000;   // 7.5 minutes
  return 300000;                         // 5 minutes default
}

/**
 * Load files from a directory (legacy function for backward compatibility)
 */
export function loadFiles(
  directory: string,
  options: {
    include?: string[];
    exclude?: string[];
    maxFileSize?: number;
  } = {}
): Record<string, string> {
  const files: Record<string, string> = {};
  const maxSize = options.maxFileSize || DEFAULT_MAX_FILE_SIZE;
  const includeExts = options.include || CODE_EXTENSIONS;
  const excludeDirs = [...IGNORE_DIRS, ...(options.exclude || [])];

  function shouldInclude(filePath: string, fileName: string): boolean {
    // Skip Flutter/Dart generated files
    if (isFlutterGeneratedFile(fileName)) {
      return false;
    }
    // Check by filename first
    if (INCLUDE_FILENAMES.includes(fileName)) {
      return true;
    }
    const ext = path.extname(filePath);
    return includeExts.some(e => ext === e || filePath.endsWith(e));
  }

  function walk(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(directory, fullPath);

        if (entry.isDirectory()) {
          if (!excludeDirs.includes(entry.name)) {
            walk(fullPath);
          }
        } else if (entry.isFile() && shouldInclude(relativePath, entry.name)) {
          try {
            const stats = fs.statSync(fullPath);
            if (stats.size <= maxSize) {
              files[relativePath] = fs.readFileSync(fullPath, 'utf-8');
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  walk(directory);
  return files;
}

/**
 * Load files using structural index with large file handling
 * Returns both the files and the structural index for dependency information
 */
export async function loadFilesWithIndex(
  directory: string,
  options: {
    include?: string[];
    exclude?: string[];
    maxFileSize?: number;
    useCache?: boolean;
    verbose?: boolean;
  } = {}
): Promise<{
  files: Record<string, string>;
  index: StructuralIndex;
  largeFiles: string[];
}> {
  const {
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    useCache = true,
    verbose = false,
  } = options;

  // Build or load structural index
  let index: StructuralIndex;
  let changedFiles: string[] | undefined;

  if (useCache) {
    const result = await updateStructuralIndex(directory, { verbose });
    index = result.index;
    changedFiles = result.changedFiles;
    if (verbose && changedFiles.length > 0) {
      console.log(`[Index] ${changedFiles.length} files changed since last run`);
    }
  } else {
    index = await buildStructuralIndex(directory, { force: true, verbose });
  }

  const files: Record<string, string> = {};
  const largeFiles: string[] = [];

  // Get files in analysis priority order (entry points first)
  const prioritizedFiles = getAnalysisPriority(index);

  for (const relativePath of prioritizedFiles) {
    const entry = index.files[relativePath];
    if (!entry) continue;

    const fullPath = path.join(directory, relativePath);

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');

      if (entry.size > LARGE_FILE_THRESHOLD) {
        // Process large file - create summary instead of full content
        const processed = processLargeFile(content, relativePath);
        files[relativePath] = createLargeFileSummary(processed);
        largeFiles.push(relativePath);

        if (verbose) {
          console.log(`[Chunker] Large file ${relativePath}: ${processed.chunkCount} chunks`);
        }
      } else if (entry.size <= maxFileSize) {
        // Normal file - include full content
        files[relativePath] = content;
      } else {
        // Medium-large file - include but note it's truncated
        files[relativePath] = content.slice(0, maxFileSize) +
          `\n\n// ... truncated (${Math.round(entry.size / 1024)}KB total)`;
      }
    } catch {
      // Skip unreadable files
    }
  }

  return { files, index, largeFiles };
}

/**
 * Analyze a codebase with custom query
 * Now uses structural indexing for:
 * - Faster subsequent runs (cached file index)
 * - Better analysis ordering (entry points first)
 * - Large file handling (chunking with summaries)
 * - Dependency information for cross-file analysis
 */
export async function analyzeCodebase(
  options: CodeAnalysisOptions
): Promise<CodeAnalysisResult> {
  const useCache = options.useCache !== false; // Default to true
  const analysisType = options.analysisType || DEFAULT_ANALYSIS_TYPE;

  // Load files with structural index
  const { files, index, largeFiles } = await loadFilesWithIndex(options.directory, {
    include: options.include,
    exclude: options.exclude,
    useCache,
    verbose: options.verbose,
  });

  const fileCount = Object.keys(files).length;

  if (fileCount === 0) {
    return {
      success: false,
      answer: null,
      turns: [],
      executionTimeMs: 0,
      subCallCount: 0,
      filesAnalyzed: [],
      analysisType,
      error: 'No files found to analyze',
    };
  }

  // Build enhanced query with structural context
  let query = options.query || getAnalysisPrompt(analysisType);

  // Add structural context to help LLM understand codebase organization
  if (index.clusters.length > 0 || index.metadata.frameworks.length > 0) {
    const structuralContext = buildStructuralContext(index, largeFiles);
    query = `${structuralContext}\n\n${query}`;
  }

  // Calculate smart max turns and timeout based on codebase size
  const maxTurns = options.maxTurns || calculateMaxTurns(fileCount);
  const timeoutMs = calculateTimeout(fileCount);

  const orchestratorConfig = {
    ...(options.model ? { rootModel: options.model, subModel: options.model } : {}),
    maxTurns,
    timeoutMs,
  };
  const orchestrator = new RLMOrchestrator(orchestratorConfig, options.verbose);
  const result = await orchestrator.processQuery(
    query,
    { files, variables: {}, mode: 'code-analysis' },
    options.onTurnComplete,
    options.onProgress
  );

  return {
    ...result,
    filesAnalyzed: Object.keys(files),
    analysisType,
  };
}

/**
 * Build structural context string to prepend to analysis queries
 */
function buildStructuralContext(index: StructuralIndex, largeFiles: string[]): string {
  const parts: string[] = ['## Codebase Structure\n'];

  // Add metadata
  if (index.metadata.frameworks.length > 0) {
    parts.push(`**Frameworks detected:** ${index.metadata.frameworks.join(', ')}`);
  }
  if (index.metadata.packageManager) {
    parts.push(`**Package manager:** ${index.metadata.packageManager}`);
  }
  if (index.metadata.languages.length > 0) {
    parts.push(`**Languages:** ${index.metadata.languages.join(', ')}`);
  }

  // Add cluster summary
  if (index.clusters.length > 0) {
    parts.push('\n**File clusters (related modules):**');
    for (const cluster of index.clusters.slice(0, 10)) {
      const entryPoints = cluster.entryPoints.slice(0, 2).join(', ');
      parts.push(`- ${cluster.type}: ${cluster.files.length} files (entry: ${entryPoints || 'N/A'})`);
    }
    if (index.clusters.length > 10) {
      parts.push(`- ... and ${index.clusters.length - 10} more clusters`);
    }
  }

  // Note large files
  if (largeFiles.length > 0) {
    parts.push(`\n**Large files (summarized):** ${largeFiles.join(', ')}`);
    parts.push('*Note: Large files are shown as summaries. Request specific sections if needed.*');
  }

  parts.push('');
  return parts.join('\n');
}

/**
 * Clear the structural index cache for a directory
 */
export function clearIndexCache(directory: string): void {
  clearCache(directory);
}

/**
 * Analyze architecture
 */
export async function analyzeArchitecture(
  directory: string,
  options: Partial<CodeAnalysisOptions> = {}
): Promise<CodeAnalysisResult> {
  return analyzeCodebase({
    ...options,
    directory,
    analysisType: 'architecture',
    query: getAnalysisPrompt('architecture'),
  });
}

/**
 * Analyze dependencies
 */
export async function analyzeDependencies(
  directory: string,
  options: Partial<CodeAnalysisOptions> = {}
): Promise<CodeAnalysisResult> {
  return analyzeCodebase({
    ...options,
    directory,
    analysisType: 'dependencies',
    query: getAnalysisPrompt('dependencies'),
  });
}

/**
 * Analyze security
 * Optionally uses web grounding to verify package version recommendations
 */
export async function analyzeSecurity(
  directory: string,
  options: Partial<CodeAnalysisOptions> = {}
): Promise<CodeAnalysisResult> {
  const result = await analyzeCodebase({
    ...options,
    directory,
    analysisType: 'security',
    query: getAnalysisPrompt('security'),
  });

  // If web grounding is enabled and we have an answer, verify package versions
  if (options.enableWebGrounding && result.success && result.answer) {
    if (options.verbose) {
      console.log('\n[Grounding] Verifying security recommendations with web search...');
    }

    const groundingResult = await verifySecurityRecommendations(
      result.answer,
      options.verbose
    );

    if (groundingResult.success && groundingResult.enhancedAnswer !== result.answer) {
      // Replace with grounded answer and add sources
      result.answer = appendGroundingSources(groundingResult.enhancedAnswer, groundingResult);

      if (options.verbose) {
        console.log(`[Grounding] Enhanced with ${groundingResult.sources.length} sources`);
      }
    } else if (!groundingResult.success && options.verbose) {
      console.log(`[Grounding] Warning: ${groundingResult.error}`);
    }
  }

  return result;
}

/**
 * Analyze performance
 */
export async function analyzePerformance(
  directory: string,
  options: Partial<CodeAnalysisOptions> = {}
): Promise<CodeAnalysisResult> {
  return analyzeCodebase({
    ...options,
    directory,
    analysisType: 'performance',
    query: getAnalysisPrompt('performance'),
  });
}

/**
 * Analyze refactoring opportunities
 */
export async function analyzeRefactoring(
  directory: string,
  options: Partial<CodeAnalysisOptions> = {}
): Promise<CodeAnalysisResult> {
  return analyzeCodebase({
    ...options,
    directory,
    analysisType: 'refactor',
    query: getAnalysisPrompt('refactor'),
  });
}

/**
 * Get codebase summary
 */
export async function summarizeCodebase(
  directory: string,
  options: Partial<CodeAnalysisOptions> = {}
): Promise<CodeAnalysisResult> {
  return analyzeCodebase({
    ...options,
    directory,
    analysisType: 'summary',
    query: getAnalysisPrompt('summary'),
  });
}

/**
 * Find usages of a symbol
 */
export async function findUsages(
  directory: string,
  symbolName: string,
  options: Partial<CodeAnalysisOptions> = {}
): Promise<CodeAnalysisResult> {
  const query = `Find all usages of "${symbolName}" in the codebase.
For each usage, provide:
1. File path
2. Line context (the relevant code)
3. Usage type (definition, import, call, reference)

Group by file and explain how the symbol is used in each location.`;

  return analyzeCodebase({
    ...options,
    directory,
    analysisType: 'custom',
    query,
  });
}

/**
 * Explain a specific file
 */
export async function explainFile(
  filePath: string,
  options: Partial<CodeAnalysisOptions> = {}
): Promise<CodeAnalysisResult> {
  const directory = path.dirname(filePath);
  const fileName = path.basename(filePath);

  const query = `Explain the file "${fileName}" in detail:
1. Purpose and responsibility
2. Main exports (functions, classes, types)
3. Dependencies and imports
4. Key logic and algorithms
5. How it fits into the broader codebase`;

  return analyzeCodebase({
    ...options,
    directory,
    analysisType: 'custom',
    query,
  });
}

/**
 * Ask a custom question about the codebase
 */
export async function askQuestion(
  directory: string,
  question: string,
  options: Partial<CodeAnalysisOptions> = {}
): Promise<CodeAnalysisResult> {
  return analyzeCodebase({
    ...options,
    directory,
    analysisType: 'custom',
    query: question,
  });
}
