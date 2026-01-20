/**
 * RLM Context Manager
 * Implements token-saving techniques from the RLM paper (arXiv:2512.24601)
 *
 * Key techniques:
 * 1. Context condensation - Summarize intermediate results
 * 2. Sliding window - Keep recent turns in full, compress older ones
 * 3. Memory bank - Extract and store key findings
 * 4. Result compression - Compress sub-LLM results
 */

import type { Content } from '@google/genai';

/** Memory bank entry for storing key findings */
export interface MemoryEntry {
  /** Unique identifier */
  id: string;
  /** Type of finding */
  type: 'file_analysis' | 'pattern' | 'dependency' | 'issue' | 'summary';
  /** The key finding or insight */
  content: string;
  /** Source file or context */
  source?: string;
  /** Importance score (1-10) */
  importance: number;
  /** Turn when this was discovered */
  turn: number;
}

/** Compressed turn representation */
export interface CompressedTurn {
  /** Turn number */
  turn: number;
  /** Brief summary of what was done */
  summary: string;
  /** Key findings extracted */
  findings: string[];
  /** Whether code was executed */
  hadCode: boolean;
  /** Whether there was an error */
  hadError: boolean;
}

/** Context manager configuration */
export interface ContextManagerConfig {
  /** Number of recent turns to keep in full detail */
  slidingWindowSize: number;
  /** Maximum memory bank entries */
  maxMemoryEntries: number;
  /** Maximum characters for compressed turn summary */
  maxSummaryLength: number;
  /** Maximum characters for sub-LLM result compression */
  maxResultLength: number;
  /** Enable aggressive compression */
  aggressiveCompression: boolean;
}

/** Default configuration */
const DEFAULT_CONFIG: ContextManagerConfig = {
  slidingWindowSize: 3,
  maxMemoryEntries: 20,
  maxSummaryLength: 200,
  maxResultLength: 1500,
  aggressiveCompression: false,
};

/**
 * Context Manager for RLM
 * Handles context compression and memory management
 */
export class ContextManager {
  private config: ContextManagerConfig;
  private memoryBank: MemoryEntry[] = [];
  private compressedHistory: CompressedTurn[] = [];

  constructor(config: Partial<ContextManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Compress a sub-LLM result to save tokens
   * Extracts key information and truncates verbose output
   */
  compressResult(result: string): string {
    if (result.length <= this.config.maxResultLength) {
      return result;
    }

    // Extract key sections (headers, bullet points, conclusions)
    const lines = result.split('\n');
    const importantLines: string[] = [];
    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Keep headers
      if (trimmed.startsWith('#') || trimmed.startsWith('##')) {
        importantLines.push(line);
        currentSection = trimmed;
        continue;
      }

      // Keep bullet points (limited)
      if ((trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('•'))
          && importantLines.length < 30) {
        importantLines.push(line);
        continue;
      }

      // Keep numbered items
      if (/^\d+\./.test(trimmed) && importantLines.length < 30) {
        importantLines.push(line);
        continue;
      }

      // Keep conclusion-like sections
      if (currentSection.toLowerCase().includes('conclusion') ||
          currentSection.toLowerCase().includes('summary') ||
          currentSection.toLowerCase().includes('key')) {
        if (trimmed && importantLines.length < 40) {
          importantLines.push(line);
        }
      }
    }

    let compressed = importantLines.join('\n');

    // If still too long, truncate with ellipsis
    if (compressed.length > this.config.maxResultLength) {
      compressed = compressed.slice(0, this.config.maxResultLength - 50) +
        '\n\n[... truncated for context efficiency ...]';
    }

    return compressed;
  }

  /**
   * Extract key findings from a turn's execution result
   */
  extractFindings(result: string, turn: number, source?: string): MemoryEntry[] {
    const findings: MemoryEntry[] = [];
    const lines = result.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) continue;

      // Look for patterns indicating important findings
      const isImportant =
        trimmed.includes('found') ||
        trimmed.includes('detected') ||
        trimmed.includes('identified') ||
        trimmed.includes('pattern') ||
        trimmed.includes('issue') ||
        trimmed.includes('warning') ||
        trimmed.includes('error') ||
        trimmed.includes('dependency') ||
        trimmed.includes('architecture') ||
        /^(#|##)\s/.test(trimmed);

      if (isImportant && trimmed.length > 10 && trimmed.length < 500) {
        findings.push({
          id: `finding-${turn}-${findings.length}`,
          type: this.categorizeFinding(trimmed),
          content: trimmed.slice(0, 300),
          source,
          importance: this.scoreFinding(trimmed),
          turn,
        });
      }
    }

    // Limit findings per turn
    return findings.slice(0, 5);
  }

  /**
   * Categorize a finding based on content
   */
  private categorizeFinding(content: string): MemoryEntry['type'] {
    const lower = content.toLowerCase();

    if (lower.includes('file') || lower.includes('module') || lower.includes('component')) {
      return 'file_analysis';
    }
    if (lower.includes('pattern') || lower.includes('architecture') || lower.includes('design')) {
      return 'pattern';
    }
    if (lower.includes('dependency') || lower.includes('import') || lower.includes('require')) {
      return 'dependency';
    }
    if (lower.includes('issue') || lower.includes('error') || lower.includes('warning') ||
        lower.includes('vulnerability') || lower.includes('bug')) {
      return 'issue';
    }
    return 'summary';
  }

  /**
   * Score a finding's importance (1-10)
   */
  private scoreFinding(content: string): number {
    const lower = content.toLowerCase();
    let score = 5;

    // Boost for critical keywords
    if (lower.includes('critical') || lower.includes('security') || lower.includes('vulnerability')) {
      score += 3;
    }
    if (lower.includes('error') || lower.includes('bug') || lower.includes('issue')) {
      score += 2;
    }
    if (lower.includes('main') || lower.includes('entry') || lower.includes('core')) {
      score += 1;
    }

    // Reduce for common/verbose patterns
    if (lower.includes('todo') || lower.includes('note')) {
      score -= 1;
    }

    return Math.min(10, Math.max(1, score));
  }

  /**
   * Add findings to memory bank
   */
  addToMemory(findings: MemoryEntry[]): void {
    for (const finding of findings) {
      // Check for duplicates
      const isDuplicate = this.memoryBank.some(
        m => m.content === finding.content ||
             (m.source === finding.source && m.type === finding.type)
      );

      if (!isDuplicate) {
        this.memoryBank.push(finding);
      }
    }

    // Prune if over limit - keep highest importance
    if (this.memoryBank.length > this.config.maxMemoryEntries) {
      this.memoryBank.sort((a, b) => b.importance - a.importance);
      this.memoryBank = this.memoryBank.slice(0, this.config.maxMemoryEntries);
    }
  }

  /**
   * Compress a turn for history storage
   */
  compressTurn(
    turn: number,
    response: string,
    executionResult: string | null,
    error: string | null
  ): CompressedTurn {
    // Extract key action from response
    let summary = '';

    if (response.includes('llm_query')) {
      const queryMatch = response.match(/llm_query\s*\(\s*f?["'`]([^"'`]{0,100})/);
      summary = queryMatch ? `Analyzed: ${queryMatch[1]}...` : 'Made sub-LLM analysis';
    } else if (response.includes('FINAL')) {
      summary = 'Provided final answer';
    } else if (response.includes('print(files')) {
      summary = 'Listed files in codebase';
    } else if (response.includes('file_index')) {
      summary = 'Read file contents';
    } else {
      summary = response.slice(0, 100).replace(/\n/g, ' ') + '...';
    }

    // Extract findings from result
    const findings: string[] = [];
    if (executionResult) {
      const resultFindings = this.extractFindings(executionResult, turn);
      findings.push(...resultFindings.map(f => f.content.slice(0, 100)));
    }

    return {
      turn,
      summary: summary.slice(0, this.config.maxSummaryLength),
      findings: findings.slice(0, 3),
      hadCode: response.includes('```'),
      hadError: !!error,
    };
  }

  /**
   * Build optimized history for model context
   * Uses sliding window - recent turns in full, older turns compressed
   */
  buildOptimizedHistory(
    fullHistory: Content[],
    _currentTurn: number
  ): Content[] {
    // If history is small, return as-is
    if (fullHistory.length <= this.config.slidingWindowSize * 2 + 2) {
      return fullHistory;
    }

    const optimized: Content[] = [];

    // Always keep the first message (system prompt + context)
    if (fullHistory.length > 0) {
      optimized.push(fullHistory[0]);
    }

    // Calculate which turns to compress
    const turnsToCompress = Math.floor((fullHistory.length - 2) / 2) - this.config.slidingWindowSize;

    if (turnsToCompress > 0 && this.compressedHistory.length > 0) {
      // Add compressed history summary
      const compressionSummary = this.buildCompressionSummary();
      optimized.push({
        role: 'user',
        parts: [{ text: compressionSummary }],
      });
    }

    // Add recent turns in full (sliding window)
    const startIndex = Math.max(1, fullHistory.length - (this.config.slidingWindowSize * 2));
    for (let i = startIndex; i < fullHistory.length; i++) {
      optimized.push(fullHistory[i]);
    }

    return optimized;
  }

  /**
   * Build a summary of compressed history
   */
  private buildCompressionSummary(): string {
    const lines: string[] = [
      '## Previous Analysis Summary (compressed for efficiency)',
      '',
    ];

    // Add compressed turns summary
    if (this.compressedHistory.length > 0) {
      lines.push('### Actions Taken:');
      for (const ct of this.compressedHistory.slice(-5)) {
        const status = ct.hadError ? '❌' : '✓';
        lines.push(`- Turn ${ct.turn} ${status}: ${ct.summary}`);
      }
      lines.push('');
    }

    // Add memory bank highlights
    if (this.memoryBank.length > 0) {
      lines.push('### Key Findings:');
      const topFindings = this.memoryBank
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 7);

      for (const finding of topFindings) {
        lines.push(`- [${finding.type}] ${finding.content.slice(0, 150)}`);
      }
      lines.push('');
    }

    lines.push('Continue analysis from where we left off.');

    return lines.join('\n');
  }

  /**
   * Register a completed turn for compression tracking
   */
  registerTurn(
    turn: number,
    response: string,
    executionResult: string | null,
    error: string | null
  ): void {
    // Compress and store the turn
    const compressed = this.compressTurn(turn, response, executionResult, error);
    this.compressedHistory.push(compressed);

    // Extract and store findings
    if (executionResult) {
      const findings = this.extractFindings(executionResult, turn);
      this.addToMemory(findings);
    }
  }

  /**
   * Get memory bank contents for final synthesis
   */
  getMemoryBank(): MemoryEntry[] {
    return [...this.memoryBank];
  }

  /**
   * Get compressed history
   */
  getCompressedHistory(): CompressedTurn[] {
    return [...this.compressedHistory];
  }

  /**
   * Build a memory summary for the model
   */
  buildMemorySummary(): string {
    if (this.memoryBank.length === 0) {
      return '';
    }

    const grouped: Record<string, MemoryEntry[]> = {};
    for (const entry of this.memoryBank) {
      if (!grouped[entry.type]) {
        grouped[entry.type] = [];
      }
      grouped[entry.type].push(entry);
    }

    const lines: string[] = ['## Analysis Memory Bank', ''];

    for (const [type, entries] of Object.entries(grouped)) {
      lines.push(`### ${type.replace('_', ' ').toUpperCase()}`);
      for (const entry of entries.slice(0, 5)) {
        lines.push(`- ${entry.content.slice(0, 200)}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Reset the context manager
   */
  reset(): void {
    this.memoryBank = [];
    this.compressedHistory = [];
  }

  /**
   * Get token savings estimate
   */
  getTokenSavingsEstimate(): { originalChars: number; compressedChars: number; savings: number } {
    let originalChars = 0;
    let compressedChars = 0;

    for (const ct of this.compressedHistory) {
      // Estimate original size (rough approximation)
      originalChars += 500 + (ct.findings.length * 200);
      compressedChars += ct.summary.length + (ct.findings.length * 50);
    }

    const savings = originalChars > 0
      ? Math.round((1 - compressedChars / originalChars) * 100)
      : 0;

    return { originalChars, compressedChars, savings };
  }
}

/**
 * Create a context manager with recommended settings
 */
export function createContextManager(
  options?: Partial<ContextManagerConfig>
): ContextManager {
  return new ContextManager(options);
}
