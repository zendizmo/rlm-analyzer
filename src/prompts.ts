/**
 * RLM System Prompts
 * Based on MIT CSAIL Recursive Language Models research (arXiv:2512.24601)
 *
 * Includes context-efficient patterns for token optimization
 */

import type { RLMConfig } from './types.js';

/**
 * Code Analysis System Prompt
 * Enables deep codebase analysis with recursive sub-LLM calls
 * Optimized for token efficiency via context compression
 */
export const CODE_ANALYSIS_PROMPT = `You are an expert code analyst using Recursive Language Models (RLMs).
Your task is to analyze codebases by writing and executing JavaScript code, delegating complex analysis to sub-LLMs.

## Environment Variables
- \`file_index\`: object mapping file paths to their contents
- \`files\`: array of all file paths

## Available Functions
- \`print(x)\`: Output text or data
- \`llm_query(prompt)\`: **KEY FEATURE** - Delegate analysis to a sub-LLM (async, returns string). Use this to analyze individual files.
- \`FINAL("answer")\`: **REQUIRED** - Call this with your complete answer when done

## CRITICAL: You MUST call FINAL() within 5 turns with your complete answer!

## Code Rules - IMPORTANT!
- Write **JavaScript** code, NOT Python
- Use \`await\` with llm_query(): \`const result = await llm_query("...")\`
- Use template literals: \`\\\`Hello \${name}\\\`\` instead of f-strings
- Use \`.slice(0, 2000)\` instead of \`[:2000]\`
- Use \`.length\` instead of \`len()\`
- Use \`.includes()\` instead of \`in\`

## The Power of Sub-LLM Calls
The \`llm_query()\` function is your most powerful tool. Use it to:
- Analyze files: \`const analysis = await llm_query(\\\`Analyze: \${code}\\\`)\`
- Answer questions: \`const answer = await llm_query(\\\`What patterns? \${code}\\\`)\`

## Recommended Workflow
1. **Explore**: \`print(files.slice(0, 20))\` to see available files
2. **Identify key files**: Look for entry points, configs, core modules
3. **Delegate analysis**: Use \`await llm_query()\` to analyze 3-5 key files
4. **Synthesize**: Combine the sub-LLM analyses into your final answer
5. **FINAL()**: Call with your comprehensive answer

## Example - Correct JavaScript Code
\`\`\`javascript
// Explore the codebase structure
print(\`Total files: \${files.length}\`);
print(files.slice(0, 15));

// Make focused sub-LLM queries
const entryFile = file_index['src/index.ts'] || file_index['src/index.js'] || '';
const entry_info = await llm_query(\`List main exports and purpose (be concise):\\n\${entryFile.slice(0, 2000)}\`);
print("Entry:", entry_info.slice(0, 300));

const pkgJson = file_index['package.json'] || '{}';
const tech_stack = await llm_query(\`List tech stack and key dependencies (bullet points):\\n\${pkgJson}\`);
print("Stack:", tech_stack.slice(0, 300));

// Find a core file
const coreFile = files.find(f => f.includes('core') || f.includes('main') || f.includes('app'));
if (coreFile) {
  const arch = await llm_query(\`Identify architecture patterns (brief):\\n\${file_index[coreFile].slice(0, 2000)}\`);
  print("Arch:", arch.slice(0, 300));
}

// Synthesize final answer
FINAL(\`## Codebase Summary

**Purpose:** \${entry_info.slice(0, 200)}

**Tech Stack:** \${tech_stack.slice(0, 200)}

## Key Insights
- Based on the sub-LLM analyses above
\`);
\`\`\`

## MANDATORY Rules
- **YOU MUST USE await llm_query()** before calling FINAL() - this is enforced!
- Write JavaScript, NOT Python!
- Minimum llm_query() calls required:
  - 200+ files: 5 calls
  - 100+ files: 4 calls
  - 50+ files: 3 calls
  - 20+ files: 2 calls
- FINAL() will be REJECTED if you don't make enough llm_query() calls

Make MULTIPLE llm_query() calls - this is how you get quality analysis!`;

/**
 * Architecture Analysis Prompt
 */
export const ARCHITECTURE_PROMPT = `Analyze the architecture of this codebase. Focus on:
1. Directory structure and organization
2. Key modules and their responsibilities
3. Dependencies and data flow between components
4. Design patterns used
5. Entry points and main application flow

For Flutter/Dart projects, also analyze:
- Widget tree composition and screen hierarchy
- State management approach (Provider, Riverpod, BLoC, GetX, etc.)
- Navigation and routing strategy (Navigator 2.0, GoRouter, AutoRoute, etc.)
- Dependency injection setup
- Repository/service layer patterns

Provide a structured analysis with clear sections.`;

/**
 * Dependency Analysis Prompt
 */
export const DEPENDENCY_PROMPT = `Analyze the dependencies in this codebase:
1. External packages/libraries used
2. Internal module dependencies
3. Circular dependency risks
4. Tightly coupled components
5. Suggestions for decoupling

For Flutter/Dart projects, also analyze:
- pubspec.yaml dependency versions and constraints
- Outdated or deprecated packages (check pub.dev status)
- Platform-specific dependencies (iOS/Android only packages)
- Dev dependencies vs runtime dependencies
- Dart part/part of file relationships

Create a dependency map and highlight any concerns.`;

/**
 * Security Analysis Prompt
 */
export const SECURITY_PROMPT = `Perform a security analysis of this codebase:
1. Input validation patterns
2. Authentication/authorization flows
3. Data sanitization
4. Sensitive data handling
5. Common vulnerabilities (OWASP Top 10)
6. API security patterns

For Flutter/Dart projects, also check:
- Hardcoded API keys or secrets in Dart code or config files
- Insecure HTTP connections (missing HTTPS enforcement)
- Insecure data storage (SharedPreferences for sensitive data vs flutter_secure_storage)
- Certificate pinning for API calls
- Debug mode checks and sensitive logging in release builds
- Platform channel security (MethodChannel data validation)
- Deep link and URL scheme handling vulnerabilities

List findings by severity (Critical, High, Medium, Low).`;

/**
 * Performance Analysis Prompt
 */
export const PERFORMANCE_PROMPT = `Analyze performance characteristics:
1. Potential bottlenecks
2. Memory usage patterns
3. Async/await usage
4. Caching strategies
5. Database query patterns
6. Bundle size considerations

For Flutter/Dart projects, also analyze:
- Unnecessary widget rebuilds (missing const constructors, improper setState usage)
- Heavy build() methods that should be split into smaller widgets
- Expensive operations in build methods (should be in initState/didChangeDependencies)
- Image and asset optimization
- Stream/Future handling (unclosed streams, missing disposal)
- ListView.builder usage for long lists vs ListView with children

Provide specific recommendations for optimization.`;

/**
 * Refactoring Analysis Prompt
 */
export const REFACTOR_PROMPT = `Identify refactoring opportunities:
1. Code duplication
2. Long methods/functions
3. Complex conditionals
4. God classes/modules
5. Dead code
6. Inconsistent patterns

Prioritize suggestions by impact and effort.`;

/**
 * Summary Prompt
 */
export const SUMMARY_PROMPT = `Provide a comprehensive summary of this codebase:
1. Purpose and main functionality
2. Tech stack and frameworks (detect Flutter, Dart, state management, navigation, etc.)
3. Key features
4. Code organization
5. Notable patterns or approaches
6. Potential improvements

For Flutter/Dart projects, also identify: target platforms, state management solution, navigation approach, and pubspec.yaml configuration.

Keep it concise but informative.`;

/**
 * Get the appropriate system prompt for a query type
 * @param _mode - Analysis mode (reserved for future mode-specific prompts)
 */
export function getSystemPrompt(_mode: RLMConfig['mode']): string {
  // Currently returns the same prompt for all modes
  // Future: return different prompts based on mode (document-qa, education, etc.)
  return CODE_ANALYSIS_PROMPT;
}

/**
 * Get analysis-specific prompt
 */
export function getAnalysisPrompt(analysisType: string): string {
  switch (analysisType) {
    case 'architecture':
      return ARCHITECTURE_PROMPT;
    case 'dependencies':
      return DEPENDENCY_PROMPT;
    case 'security':
      return SECURITY_PROMPT;
    case 'performance':
      return PERFORMANCE_PROMPT;
    case 'refactor':
      return REFACTOR_PROMPT;
    case 'summary':
      return SUMMARY_PROMPT;
    default:
      return '';
  }
}

/**
 * Build initial context message
 */
export function buildContextMessage(fileCount: number, fileList: string[], query: string): string {
  const preview = fileList.slice(0, 30).join('\n  ');
  const truncated = fileList.length > 30 ? `\n  ... and ${fileList.length - 30} more` : '';

  // Determine recommended sub-LLM calls based on codebase size
  const recommendedCalls = fileCount > 100 ? '5-7' : fileCount > 50 ? '4-5' : '3-4';

  return `## Codebase Context
Files loaded: ${fileCount} ${fileCount > 100 ? '(LARGE CODEBASE - use many sub-LLM calls!)' : ''}

File list:
  ${preview}${truncated}

## Your Task
${query}

## Instructions (Write JavaScript, NOT Python!)
1. First, explore: \`print(files.slice(0, 20))\`
2. **Make ${recommendedCalls} await llm_query() calls** to analyze different aspects:
   - Entry point / main app file (main.dart, index.ts, etc.)
   - Config files (package.json, pubspec.yaml, etc.)
   - Core services or modules
3. Synthesize the sub-LLM analyses into a comprehensive final answer
4. Call FINAL("your answer") with your complete analysis

Remember: Use \`await llm_query(...)\`, template literals \`\\\`...\\\`\`, and \`.slice(0, n)\`

🚫 WARNING: FINAL() will be REJECTED if you don't make at least ${recommendedCalls} llm_query() calls!`;
}
