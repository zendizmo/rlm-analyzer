/**
 * File Chunker Module
 * Handles large files by chunking them intelligently and generating summaries
 * so important context isn't lost during analysis.
 *
 * Strategy:
 * 1. Chunk large files by logical boundaries (functions, classes)
 * 2. Generate brief summaries of each chunk
 * 3. Provide full chunk content on demand
 */

import type { FileChunk } from './types.js';

/** Default chunk size (50KB) */
const DEFAULT_CHUNK_SIZE = 50_000;

/** Maximum file size to process (500KB - anything larger gets skeleton only) */
const MAX_PROCESSABLE_SIZE = 500_000;

// ============================================================================
// Smart Chunking (by logical boundaries)
// ============================================================================

/** Language-specific boundary patterns */
const BOUNDARY_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /^(?:export\s+)?(?:async\s+)?function\s+\w+/m,
    /^(?:export\s+)?class\s+\w+/m,
    /^(?:export\s+)?interface\s+\w+/m,
    /^(?:export\s+)?type\s+\w+\s*=/m,
    /^(?:export\s+)?const\s+\w+\s*=/m,
  ],
  javascript: [
    /^(?:export\s+)?(?:async\s+)?function\s+\w+/m,
    /^(?:export\s+)?class\s+\w+/m,
    /^(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(/m,
    /^module\.exports/m,
  ],
  python: [
    /^class\s+\w+/m,
    /^(?:async\s+)?def\s+\w+/m,
    /^@\w+/m, // decorators
  ],
  java: [
    /^(?:public|private|protected)\s+(?:static\s+)?class\s+\w+/m,
    /^(?:public|private|protected)\s+(?:static\s+)?(?:\w+\s+)+\w+\s*\(/m,
  ],
  kotlin: [
    /^(?:class|interface|object|enum\s+class|sealed\s+class|data\s+class)\s+\w+/m,
    /^fun\s+(?:<[^>]+>\s+)?(?:[\w.]+\.)?\w+/m,
  ],
  go: [
    /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?\w+/m,
    /^type\s+\w+\s+(?:struct|interface)/m,
  ],
  rust: [
    /^(?:pub\s+)?fn\s+\w+/m,
    /^(?:pub\s+)?struct\s+\w+/m,
    /^(?:pub\s+)?enum\s+\w+/m,
    /^(?:pub\s+)?trait\s+\w+/m,
    /^impl\s+(?:\w+\s+for\s+)?\w+/m,
  ],
  dart: [
    /^(?:abstract\s+|sealed\s+|base\s+|final\s+)?class\s+\w+/m,
    /^mixin\s+\w+/m,
    /^enum\s+\w+/m,
    /^extension\s+\w+/m,
    /^typedef\s+\w+/m,
    /^(?:void|int|double|String|bool|Future|Stream|Widget|List|Map|Set|dynamic|\w+(?:<[^>]*>)?\??)\s+\w+\s*[(<]/m,
    /^\s+(?:Widget\s+)?build\s*\(/m,
    /^\s+@override/m,
  ],
};

/**
 * Get language from extension
 */
function getLanguageFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
    '.py': 'python',
    '.dart': 'dart',
    '.java': 'java', '.kt': 'kotlin', '.kts': 'kotlin',
    '.go': 'go',
    '.rs': 'rust',
  };
  return map[ext] || 'typescript';
}

/**
 * Find logical boundaries in code
 */
function findLogicalBoundaries(content: string, ext: string): number[] {
  const lang = getLanguageFromExt(ext);
  const patterns = BOUNDARY_PATTERNS[lang] || BOUNDARY_PATTERNS.typescript;
  const lines = content.split('\n');
  const boundaries: number[] = [0]; // Always start at 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        // Don't add if too close to last boundary
        const lastBoundary = boundaries[boundaries.length - 1];
        if (i - lastBoundary > 10) {
          boundaries.push(i);
        }
        break;
      }
    }
  }

  return boundaries;
}

/**
 * Chunk file by logical boundaries when possible
 */
export function smartChunkFile(
  content: string,
  ext: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): FileChunk[] {
  const lines = content.split('\n');
  const boundaries = findLogicalBoundaries(content, ext);
  const chunks: FileChunk[] = [];

  let currentStart = 0;
  let currentSize = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineSize = lines[i].length + 1;
    currentSize += lineSize;

    // Check if we should end chunk here
    const atBoundary = boundaries.includes(i + 1);
    const sizeExceeded = currentSize >= chunkSize;

    if ((atBoundary && currentSize > chunkSize / 2) || sizeExceeded) {
      const chunkLines = lines.slice(currentStart, i + 1);
      chunks.push({
        index: chunks.length,
        total: 0,
        startLine: currentStart,
        endLine: i,
        content: chunkLines.join('\n'),
      });
      currentStart = i + 1;
      currentSize = 0;
    }
  }

  // Don't forget remaining content
  if (currentStart < lines.length) {
    chunks.push({
      index: chunks.length,
      total: 0,
      startLine: currentStart,
      endLine: lines.length - 1,
      content: lines.slice(currentStart).join('\n'),
    });
  }

  // Update totals
  const total = chunks.length;
  chunks.forEach(c => { c.total = total; });

  return chunks;
}

// ============================================================================
// Chunk Summarization
// ============================================================================

/**
 * Extract a skeleton/outline from a chunk (no LLM needed)
 */
export function extractChunkSkeleton(chunk: FileChunk, ext: string): string {
  const lines = chunk.content.split('\n');
  const skeleton: string[] = [];
  const lang = getLanguageFromExt(ext);
  const patterns = BOUNDARY_PATTERNS[lang] || BOUNDARY_PATTERNS.typescript;

  for (const line of lines) {
    // Include imports
    if (/^import\s|^from\s|^require\s|^use\s|^using\s|^export\s+['"]|^part\s/.test(line)) {
      skeleton.push(line);
      continue;
    }

    // Include boundary lines (function/class definitions)
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        skeleton.push(line);
        break;
      }
    }

    // Include comments that look like documentation
    if (/^\s*\/\*\*|^\s*\/\/\/|^\s*#\s+\w|^\s*"""|^\s*'''/.test(line)) {
      skeleton.push(line);
    }
  }

  return skeleton.join('\n');
}

/**
 * Generate a brief description of what's in a chunk (pattern-based, no LLM)
 */
export function describeChunk(chunk: FileChunk, _ext: string): string {
  const content = chunk.content;
  const items: string[] = [];

  // Count functions
  const funcMatches = content.match(/(?:function|def|fn|func)\s+(\w+)/g);
  if (funcMatches && funcMatches.length > 0) {
    items.push(`${funcMatches.length} function(s)`);
  }

  // Count classes
  const classMatches = content.match(/class\s+(\w+)/g);
  if (classMatches && classMatches.length > 0) {
    items.push(`${classMatches.length} class(es)`);
  }

  // Count interfaces/types
  const typeMatches = content.match(/(?:interface|type)\s+(\w+)/g);
  if (typeMatches && typeMatches.length > 0) {
    items.push(`${typeMatches.length} type(s)`);
  }

  // Check for exports
  if (/export\s+(default\s+)?/.test(content)) {
    items.push('exports');
  }

  const lineCount = chunk.endLine - chunk.startLine + 1;
  const desc = items.length > 0 ? items.join(', ') : 'code block';

  return `Lines ${chunk.startLine + 1}-${chunk.endLine + 1} (${lineCount} lines): ${desc}`;
}

// ============================================================================
// Large File Processing
// ============================================================================

/** Processed large file result */
export interface ProcessedLargeFile {
  /** Original file path */
  path: string;
  /** Total size in bytes */
  size: number;
  /** Number of chunks */
  chunkCount: number;
  /** Skeleton/outline of the file */
  skeleton: string;
  /** Brief description of each chunk */
  chunkDescriptions: string[];
  /** Full chunks (for on-demand access) */
  chunks: FileChunk[];
  /** Whether file was too large to fully process */
  truncated: boolean;
}

/**
 * Process a large file for analysis
 */
export function processLargeFile(
  content: string,
  filePath: string,
  options: {
    chunkSize?: number;
    maxSize?: number;
  } = {}
): ProcessedLargeFile {
  const { chunkSize = DEFAULT_CHUNK_SIZE, maxSize = MAX_PROCESSABLE_SIZE } = options;
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  const size = content.length;
  const truncated = size > maxSize;

  // If too large, only process first portion
  const processableContent = truncated ? content.slice(0, maxSize) : content;

  // Smart chunk by logical boundaries
  const chunks = smartChunkFile(processableContent, ext, chunkSize);

  // Generate skeleton from all chunks
  const skeletonParts = chunks.map(chunk => extractChunkSkeleton(chunk, ext));
  const skeleton = skeletonParts.filter(s => s.trim()).join('\n\n');

  // Generate descriptions
  const chunkDescriptions = chunks.map(chunk => describeChunk(chunk, ext));

  return {
    path: filePath,
    size,
    chunkCount: chunks.length,
    skeleton,
    chunkDescriptions,
    chunks,
    truncated,
  };
}

/**
 * Create a summary representation of a large file for the LLM
 */
export function createLargeFileSummary(processed: ProcessedLargeFile): string {
  const header = `[Large File: ${processed.path}]
Size: ${Math.round(processed.size / 1024)}KB | Chunks: ${processed.chunkCount}${processed.truncated ? ' (truncated)' : ''}

`;

  const structure = `## Structure
${processed.chunkDescriptions.map((d, i) => `  ${i + 1}. ${d}`).join('\n')}

`;

  const skeletonSection = `## Skeleton (key definitions)
\`\`\`
${processed.skeleton.slice(0, 3000)}${processed.skeleton.length > 3000 ? '\n... (truncated)' : ''}
\`\`\`
`;

  return header + structure + skeletonSection;
}

/**
 * Get a specific chunk's full content
 */
export function getChunkContent(processed: ProcessedLargeFile, chunkIndex: number): string | null {
  const chunk = processed.chunks[chunkIndex];
  if (!chunk) return null;

  return `[Chunk ${chunkIndex + 1}/${processed.chunkCount} of ${processed.path}]
Lines ${chunk.startLine + 1}-${chunk.endLine + 1}

${chunk.content}`;
}

// ============================================================================
// Exports for Integration
// ============================================================================

export {
  DEFAULT_CHUNK_SIZE,
  MAX_PROCESSABLE_SIZE,
};
