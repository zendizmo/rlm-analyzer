/**
 * Code Analysis High-Level API
 * Provides easy-to-use functions for common analysis tasks
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  CodeAnalysisOptions,
  CodeAnalysisResult,
} from './types.js';
import { CODE_EXTENSIONS, IGNORE_DIRS } from './types.js';
import { RLMOrchestrator } from './orchestrator.js';
import { getAnalysisPrompt } from './prompts.js';

/** Default maximum file size in bytes (100KB) */
export const DEFAULT_MAX_FILE_SIZE = 100_000;

/** Default analysis type when not specified */
export const DEFAULT_ANALYSIS_TYPE = 'summary' as const;

/**
 * Load files from a directory
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

  function shouldInclude(filePath: string): boolean {
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
        } else if (entry.isFile() && shouldInclude(entry.name)) {
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
 * Analyze a codebase with custom query
 */
export async function analyzeCodebase(
  options: CodeAnalysisOptions
): Promise<CodeAnalysisResult> {
  const files = loadFiles(options.directory, {
    include: options.include,
    exclude: options.exclude,
  });

  const fileCount = Object.keys(files).length;
  const analysisType = options.analysisType || DEFAULT_ANALYSIS_TYPE;

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

  const query = options.query || getAnalysisPrompt(analysisType);

  const orchestratorConfig = options.model ? { rootModel: options.model, subModel: options.model } : {};
  const orchestrator = new RLMOrchestrator(orchestratorConfig, options.verbose);
  const result = await orchestrator.processQuery(
    query,
    { files, variables: {}, mode: 'code-analysis' },
    options.onTurnComplete
  );

  return {
    ...result,
    filesAnalyzed: Object.keys(files),
    analysisType,
  };
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
 */
export async function analyzeSecurity(
  directory: string,
  options: Partial<CodeAnalysisOptions> = {}
): Promise<CodeAnalysisResult> {
  return analyzeCodebase({
    ...options,
    directory,
    analysisType: 'security',
    query: getAnalysisPrompt('security'),
  });
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
