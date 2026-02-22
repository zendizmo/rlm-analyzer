/**
 * RLM REPL Executor
 * Executes Python-like code in a sandboxed JavaScript environment
 * with support for sub-LLM calls
 */

import type { ExecutorResult } from './types.js';

/** Dangerous patterns to block */
const DANGEROUS_PATTERNS = [
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\bexec\s*\(/,
  /\bcompile\s*\(/,
  /\b__import__\s*\(/,
  /\bprocess\s*\./,
  /\brequire\s*\(/,
  /\bimport\s*\(/,
  /\bfs\s*\./,
  /\bchild_process/,
  /\bspawn\s*\(/,
  /\bexecSync\s*\(/,
  /\bwriteFile/,
  /\bunlink\s*\(/,
  /\brmdir\s*\(/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest/,
  /\bWebSocket/,
];

/**
 * REPL Executor with sandboxed execution
 */
export class RLMExecutor {
  private variables: Map<string, unknown> = new Map();
  private output: string[] = [];
  private subCallCount = 0;
  private maxSubCalls: number;
  private finalAnswer: string | null = null;
  private subLLMCallback: ((query: string) => Promise<string>) | null = null;
  private onSubLLMCall: ((count: number) => void) | null = null;

  constructor(maxSubCalls = 15) {
    this.maxSubCalls = maxSubCalls;
  }

  /**
   * Set callback for when a sub-LLM call is made (for progress tracking)
   */
  setOnSubLLMCall(callback: (count: number) => void): void {
    this.onSubLLMCall = callback;
  }

  /**
   * Initialize the execution context with files
   */
  initialize(files: Record<string, string>): void {
    this.variables.set('file_index', files);
    this.variables.set('files', Object.keys(files));
  }

  /**
   * Set the sub-LLM callback
   */
  setSubLLMCallback(callback: (query: string) => Promise<string>): void {
    this.subLLMCallback = callback;
  }

  /**
   * Execute code and return result
   */
  async execute(code: string): Promise<ExecutorResult> {
    // Extract code from markdown blocks
    const cleanCode = this.extractCode(code);

    // Check if this is just a FINAL call (no dangerous operations needed)
    const isFinalOnly = /^\s*FINAL\s*\([\s\S]*?\)\s*;?\s*$/.test(cleanCode.trim());

    // Security validation (skip for FINAL-only calls which just set output)
    if (!isFinalOnly) {
      const securityCheck = this.validateSecurity(cleanCode);
      if (!securityCheck.safe) {
        return {
          success: false,
          output: '',
          error: `Security violation: ${securityCheck.reason}`,
        };
      }
    }

    try {
      const result = await this.executeInSandbox(cleanCode);
      return { success: true, output: result };
    } catch (error) {
      return {
        success: false,
        output: this.output.join('\n'),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract code from markdown code blocks
   */
  private extractCode(text: string): string {
    const match = text.match(/```(?:python|javascript|tool_code|js|ts)?\n([\s\S]*?)```/);
    return match ? match[1] : text;
  }

  /**
   * Validate code for security issues
   */
  private validateSecurity(code: string): { safe: boolean; reason?: string } {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(code)) {
        return { safe: false, reason: `Blocked pattern: ${pattern.source}` };
      }
    }
    return { safe: true };
  }

  /**
   * Convert Python-like syntax to JavaScript and execute
   */
  private async executeInSandbox(pythonCode: string): Promise<string> {
    const outputBuffer: string[] = [];
    const fileIndex = this.variables.get('file_index') as Record<string, string>;
    const files = this.variables.get('files') as string[];

    // 1. Python to JavaScript conversion
    let js = pythonCode;

    // 2. Pre-process strings that need structural conversion
    // Convert f-strings
    js = js.replace(/f"([^"]*)"/g, (_, s) => '`' + s.replace(/\{([^}]+)\}/g, '${$1}') + '`');
    js = js.replace(/f'([^']*)'/g, (_, s) => '`' + s.replace(/\{([^}]+)\}/g, '${$1}') + '`');

    // Convert Python triple-quoted strings to JS template literals
    js = js.replace(/"""([\s\S]*?)"""/g, '`$1`');
    js = js.replace(/'''([\s\S]*?)'''/g, '`$1`');

    // String containment: "x" in str -> str.includes("x")
    js = js.replace(/(["'`][^"'`]+["'`])\s+in\s+(\w+)/g, '$2.includes($1)');

    // 3. Temporarily mask all strings so regexes don't corrupt their contents
    const maskedStrings: string[] = [];
    js = js.replace(/`[\s\S]*?`|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/g, (m) => {
      maskedStrings.push(m);
      return `__MASKED_STR_${maskedStrings.length - 1}__`;
    });

    // 4. Perform dangerous regex replacements safely
    // Convert Python comments to JavaScript comments
    js = js.replace(/^(\s*)#(.*)$/gm, '$1//$2');

    // Remove Python imports
    js = js.replace(/^import\s+\w+.*$/gm, '// import removed');
    js = js.replace(/^from\s+\w+.*$/gm, '// from import removed');

    // Convert list comprehension [expr for x in list if cond]
    js = js.replace(
      /\[\s*([^\[\]]+?)\s+for\s+(\w+)\s+in\s+([^\[\]]+?)\s+if\s+([^\[\]]+?)\s*\]/g,
      '$3.filter($2 => $4).map($2 => $1)'
    );

    // Convert list comprehension [expr for x in list]
    js = js.replace(
      /\[\s*([^\[\]]+?)\s+for\s+(\w+)\s+in\s+([^\[\]]+?)\s*\]/g,
      '$3.map($2 => $1)'
    );

    // Convert for loops with tuple unpacking
    js = js.replace(
      /for\s+(\w+)\s*,\s*(\w+)\s+in\s+(\w+)\.items\(\)\s*:/g,
      'for (const [$1, $2] of Object.entries($3)) {'
    );

    // Convert simple for loops
    js = js.replace(
      /for\s+(\w+)\s+in\s+(\w+)\s*:/g,
      'for (const $1 of $2) {'
    );

    // Convert if statements
    js = js.replace(/^(\s*)if\s+(.+?)\s*:\s*$/gm, '$1if ($2) {');
    js = js.replace(/^(\s*)elif\s+(.+?)\s*:\s*$/gm, '$1} else if ($2) {');
    js = js.replace(/^(\s*)else\s*:\s*$/gm, '$1} else {');

    // Handle indentation-based blocks
    js = this.convertIndentationToBlocks(js);

    // Python built-ins
    js = js.replace(/\blen\((\w+)\)/g, '$1.length');
    js = js.replace(/\bTrue\b/g, 'true');
    js = js.replace(/\bFalse\b/g, 'false');
    js = js.replace(/\bNone\b/g, 'null');
    js = js.replace(/\bif\s*\(([^)]*)\band\b([^)]*)\)/g, 'if ($1&&$2)');
    js = js.replace(/\bif\s*\(([^)]*)\bor\b([^)]*)\)/g, 'if ($1||$2)');
    js = js.replace(/\bwhile\s*\(([^)]*)\band\b([^)]*)\)/g, 'while ($1&&$2)');
    js = js.replace(/\bwhile\s*\(([^)]*)\bor\b([^)]*)\)/g, 'while ($1||$2)');
    js = js.replace(/\bnot\s+(\w)/g, '!$1');

    // Dict methods - convert .get(key) and .get(key, default)
    js = js.replace(/\.get\(([^,)]+),\s*([^)]+)\)/g, '?.[$1] ?? $2');
    js = js.replace(/\.get\(([^)]+)\)/g, '?.[$1]');

    // Dict methods - .keys(), .values()
    js = js.replace(/(\w+)\.keys\(\)/g, 'Object.keys($1)');
    js = js.replace(/(\w+)\.values\(\)/g, 'Object.values($1)');

    // String methods
    js = js.replace(/\.lower\(\)/g, '.toLowerCase()');
    js = js.replace(/\.upper\(\)/g, '.toUpperCase()');
    js = js.replace(/\.strip\(\)/g, '.trim()');
    js = js.replace(/\.split\(\)/g, '.split(" ")');
    js = js.replace(/\.endswith\(/g, '.endsWith(');
    js = js.replace(/\.startswith\(/g, '.startsWith(');

    // Slicing
    js = js.replace(/(\]\s*)\[:(\d+)\]/g, '$1.slice(0, $2)');
    js = js.replace(/(\]\s*)\[(\d+):\]/g, '$1.slice($2)');
    js = js.replace(/(\]\s*)\[(-?\d+):(-?\d+)\]/g, '$1.slice($2, $3)');
    js = js.replace(/(\w+)\[:(\d+)\]/g, '$1.slice(0, $2)');
    js = js.replace(/(\w+)\[(\d+):\]/g, '$1.slice($2)');
    js = js.replace(/(\w+)\[(-?\d+):(-?\d+)\]/g, '$1.slice($2, $3)');

    // 5. Restore masked strings
    js = js.replace(/__MASKED_STR_(\d+)__/g, (_, i) => maskedStrings[parseInt(i)]);

    // 6. Function mappings
    js = js.replace(/\bprint\(/g, '_print(');
    js = js.replace(/\bllm_query\(/g, 'await _llmQuery(');
    js = js.replace(/\bFINAL\((['"`][\s\S]*?['"`])\)/g, '_setFinal($1)');

    // Create sandbox with limited scope
    const sandbox = {
      file_index: fileIndex,
      files: files,

      _print: (...args: unknown[]) => {
        const str = args.map(a =>
          typeof a === 'string' ? a : JSON.stringify(a, null, 2)
        ).join(' ');
        outputBuffer.push(str);
        this.output.push(str);
        return str;
      },

      _llmQuery: async (query: string): Promise<string> => {
        if (this.subCallCount >= this.maxSubCalls) {
          throw new Error(`Maximum sub-LLM calls (${this.maxSubCalls}) exceeded`);
        }
        if (!this.subLLMCallback) {
          throw new Error('Sub-LLM callback not configured');
        }
        this.subCallCount++;
        // Notify progress tracker of sub-LLM call
        if (this.onSubLLMCall) {
          this.onSubLLMCall(this.subCallCount);
        }
        return this.subLLMCallback(query);
      },

      _setFinal: (answer: unknown) => {
        const str = typeof answer === 'string' ? answer : JSON.stringify(answer, null, 2);
        this.finalAnswer = str;
        return str;
      },

      // FINAL function (also available directly without conversion)
      FINAL: (answer: unknown) => {
        const str = typeof answer === 'string' ? answer : JSON.stringify(answer, null, 2);
        this.finalAnswer = str;
        return str;
      },

      // llm_query function (also available directly)
      llm_query: async (query: string): Promise<string> => {
        if (this.subCallCount >= this.maxSubCalls) {
          throw new Error(`Maximum sub-LLM calls (${this.maxSubCalls}) exceeded`);
        }
        if (!this.subLLMCallback) {
          throw new Error('Sub-LLM callback not configured');
        }
        this.subCallCount++;
        // Notify progress tracker of sub-LLM call
        if (this.onSubLLMCall) {
          this.onSubLLMCall(this.subCallCount);
        }
        return this.subLLMCallback(query);
      },

      // Safe built-ins
      Object, Array, Math, JSON, String, Number, RegExp, Date,
      parseInt, parseFloat, isNaN, isFinite,
      encodeURIComponent, decodeURIComponent,
      console: {
        log: (...args: unknown[]) => outputBuffer.push(args.map(String).join(' ')),
      },
    };

    // Execute in async context
    const asyncFn = new Function('sandbox', `
      with (sandbox) {
        return (async () => {
          ${js}
        })();
      }
    `);

    await asyncFn(sandbox);
    return outputBuffer.join('\n');
  }

  /**
   * Convert Python indentation to JavaScript blocks
   */
  private convertIndentationToBlocks(code: string): string {
    const lines = code.split('\n');
    const processed: string[] = [];
    const indentStack: number[] = [0];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trimStart();
      const indent = line.length - trimmed.length;

      // Skip empty lines
      if (!trimmed) {
        processed.push(line);
        continue;
      }

      // Close braces for dedented lines
      while (indentStack.length > 1 && indent < indentStack[indentStack.length - 1]) {
        indentStack.pop();
        processed.push(' '.repeat(indentStack[indentStack.length - 1]) + '}');
      }

      // Track new indentation after opening braces
      if (trimmed.endsWith('{')) {
        processed.push(line);
        indentStack.push(indent + 4);
      } else {
        processed.push(line);
      }
    }

    // Close remaining blocks
    while (indentStack.length > 1) {
      indentStack.pop();
      processed.push('}');
    }

    return processed.join('\n');
  }

  /**
   * Check if final answer was set
   */
  hasFinalAnswer(): boolean {
    return this.finalAnswer !== null;
  }

  /**
   * Get the final answer
   */
  getFinalAnswer(): string | null {
    return this.finalAnswer;
  }

  /**
   * Get all output
   */
  getOutput(): string {
    return this.output.join('\n');
  }

  /**
   * Get sub-call count
   */
  getSubCallCount(): number {
    return this.subCallCount;
  }

  /**
   * Reset state for new execution
   */
  reset(): void {
    this.output = [];
    this.subCallCount = 0;
    this.finalAnswer = null;
  }


  /**
   * Clear just the final answer (used when rejecting insufficient analysis)
   */
  clearFinalAnswer(): void {
    this.finalAnswer = null;
  }
}
