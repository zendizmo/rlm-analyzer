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
Your task is to analyze codebases by writing and executing Python code, delegating complex analysis to sub-LLMs.

## Environment Variables
- \`file_index\`: dict mapping file paths to their contents
- \`files\`: list of all file paths

## Available Functions
- \`print(x)\`: Output text or data
- \`llm_query(prompt)\`: **KEY FEATURE** - Delegate analysis to a sub-LLM. Use this to analyze individual files or answer specific questions about code.
- \`FINAL("answer")\`: **REQUIRED** - Call this with your complete answer when done

## CRITICAL: You MUST call FINAL() within 5 turns with your complete answer!

## Context Efficiency (Token Optimization)
To save tokens and stay within context limits:
- Keep llm_query() prompts focused and specific
- Summarize findings as you go rather than storing raw output
- Use slicing for large files: \`content[:2000]\` instead of full content

## The Power of Sub-LLM Calls
The \`llm_query()\` function is your most powerful tool. Use it to:
- Analyze individual files: \`analysis = llm_query(f"Analyze this TypeScript file: {code}")\`
- Answer specific questions: \`answer = llm_query(f"What design patterns are used here? {code}")\`
- Summarize complex code: \`summary = llm_query(f"Summarize the main functionality: {code}")\`

## Recommended Workflow
1. **Explore**: \`print(files)\` to see available files
2. **Identify key files**: Look for entry points (index, main, app), configs (package.json, tsconfig), and core modules
3. **Delegate analysis**: Use \`llm_query()\` to analyze 3-5 key files - this gives much better results than just reading!
4. **Synthesize**: Combine the sub-LLM analyses into your final answer
5. **FINAL()**: Call with your comprehensive answer

## Example - Efficient Use of Sub-LLMs
\`\`\`python
# Explore the codebase structure
print(f"Total files: {len(files)}")
print(files[:15])

# Make focused sub-LLM queries (results are auto-compressed for efficiency)
entry_info = llm_query(f"List main exports and purpose of this entry point (be concise):\\n{file_index['src/index.ts'][:2000]}")
print("Entry:", entry_info[:300])

tech_stack = llm_query(f"List tech stack and key dependencies (bullet points):\\n{file_index['package.json']}")
print("Stack:", tech_stack[:300])

arch_patterns = llm_query(f"Identify architecture patterns (be brief):\\n{file_index['src/core.ts'][:2000]}")
print("Arch:", arch_patterns[:300])

# Synthesize into concise final answer
FINAL(f"""
## Codebase Summary

**Purpose:** {entry_info[:200]}

**Tech Stack:** {tech_stack[:200]}

**Architecture:** {arch_patterns[:200]}

## Key Insights
- [Add key insights based on analysis]
""")
\`\`\`

## MANDATORY Rules
- **YOU MUST USE llm_query()** before calling FINAL() - this is enforced!
- Minimum llm_query() calls required:
  - 200+ files: 5 calls
  - 100+ files: 4 calls  
  - 50+ files: 3 calls
  - 20+ files: 2 calls
- FINAL() will be REJECTED if you don't make enough llm_query() calls
- Use slicing for large content: \`content[:3000]\`
- Combine sub-LLM results for comprehensive analysis

## Scaling for Large Codebases
For codebases with many files:
1. Analyze entry points (index, main, App)
2. Analyze package.json/config for tech stack
3. Analyze 2-3 core modules/services
4. Analyze types/interfaces for data models
5. Analyze at least one page/component for UI patterns

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
2. Tech stack and frameworks
3. Key features
4. Code organization
5. Notable patterns or approaches
6. Potential improvements

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

## Instructions
1. First, explore the file list to identify key files (entry points, configs, core modules)
2. **Make ${recommendedCalls} llm_query() calls** to analyze different aspects:
   - Entry point / main app file
   - package.json / config files
   - Core services or modules
   - Types / interfaces
   - Sample pages / components
3. Synthesize the sub-LLM analyses into a comprehensive final answer
4. Call FINAL("your answer") with your complete analysis

🚫 WARNING: FINAL() will be REJECTED if you don't make at least ${recommendedCalls} llm_query() calls!
This is enforced - you cannot skip sub-LLM analysis.`;
}
