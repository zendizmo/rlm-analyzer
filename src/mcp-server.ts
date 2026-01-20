#!/usr/bin/env node
/**
 * RLM Analyzer MCP Server
 * Exposes RLM analysis capabilities via Model Context Protocol
 *
 * Usage with Claude Code:
 * Add to ~/.claude/claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "rlm-analyzer": {
 *       "command": "npx",
 *       "args": ["rlm-analyzer-mcp"],
 *       "env": { "GEMINI_API_KEY": "your_key" }
 *     }
 *   }
 * }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import {
  analyzeCodebase,
  analyzeArchitecture,
  analyzeDependencies,
  analyzeSecurity,
  analyzeRefactoring,
  summarizeCodebase,
  askQuestion,
} from './analyzer.js';
import { resolveModelConfig, resolveModelAlias } from './models.js';
import { hasApiKey } from './config.js';
import type { AnalysisType } from './types.js';

// Tool definitions
const TOOLS = [
  {
    name: 'rlm_analyze',
    description: 'Analyze a codebase using recursive LLM analysis. Can answer complex questions about code architecture, patterns, and implementation details by recursively examining files.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directory: {
          type: 'string',
          description: 'Absolute path to the directory to analyze',
        },
        query: {
          type: 'string',
          description: 'Question or analysis request about the codebase',
        },
        analysisType: {
          type: 'string',
          enum: ['architecture', 'dependencies', 'security', 'performance', 'refactor', 'summary', 'custom'],
          description: 'Type of analysis to perform (default: custom if query provided, summary otherwise)',
        },
        model: {
          type: 'string',
          description: 'Model to use: fast, smart, or full model ID (default: from environment)',
        },
      },
      required: ['directory'],
    },
  },
  {
    name: 'rlm_summarize',
    description: 'Get a comprehensive summary of a codebase including purpose, tech stack, architecture, and key components.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directory: {
          type: 'string',
          description: 'Absolute path to the directory to analyze',
        },
        model: {
          type: 'string',
          description: 'Model to use: fast, smart, or full model ID',
        },
      },
      required: ['directory'],
    },
  },
  {
    name: 'rlm_architecture',
    description: 'Analyze the architecture and structure of a codebase. Identifies patterns, layers, components, and their relationships.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directory: {
          type: 'string',
          description: 'Absolute path to the directory to analyze',
        },
        model: {
          type: 'string',
          description: 'Model to use: fast, smart, or full model ID',
        },
      },
      required: ['directory'],
    },
  },
  {
    name: 'rlm_security',
    description: 'Perform security analysis on a codebase. Identifies potential vulnerabilities, insecure patterns, and security best practice violations.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directory: {
          type: 'string',
          description: 'Absolute path to the directory to analyze',
        },
        model: {
          type: 'string',
          description: 'Model to use: fast, smart, or full model ID',
        },
      },
      required: ['directory'],
    },
  },
  {
    name: 'rlm_dependencies',
    description: 'Analyze dependencies in a codebase. Maps internal and external dependencies, identifies circular dependencies and coupling issues.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directory: {
          type: 'string',
          description: 'Absolute path to the directory to analyze',
        },
        model: {
          type: 'string',
          description: 'Model to use: fast, smart, or full model ID',
        },
      },
      required: ['directory'],
    },
  },
  {
    name: 'rlm_refactor',
    description: 'Find refactoring opportunities in a codebase. Identifies code duplication, complex functions, and improvement opportunities.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directory: {
          type: 'string',
          description: 'Absolute path to the directory to analyze',
        },
        model: {
          type: 'string',
          description: 'Model to use: fast, smart, or full model ID',
        },
      },
      required: ['directory'],
    },
  },
  {
    name: 'rlm_ask',
    description: 'Ask a specific question about a codebase. The AI will analyze relevant files to answer your question.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directory: {
          type: 'string',
          description: 'Absolute path to the directory to analyze',
        },
        question: {
          type: 'string',
          description: 'The question to answer about the codebase',
        },
        model: {
          type: 'string',
          description: 'Model to use: fast, smart, or full model ID',
        },
      },
      required: ['directory', 'question'],
    },
  },
  {
    name: 'rlm_config',
    description: 'Get current RLM Analyzer configuration including model settings and API key status.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
];

// Create server
const server = new Server(
  { name: 'rlm-analyzer', version: '1.1.0' },
  { capabilities: { tools: {} } }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: args } = request.params;

  try {
    // Check API key for analysis tools
    if (name !== 'rlm_config' && !hasApiKey()) {
      return {
        content: [{
          type: 'text',
          text: 'Error: GEMINI_API_KEY not configured. Set it in the MCP server environment.',
        }],
        isError: true,
      };
    }

    const model = args?.model ? resolveModelAlias(args.model as string) : undefined;
    const options = model ? { model } : {};

    switch (name) {
      case 'rlm_analyze': {
        const { directory, query, analysisType } = args as {
          directory: string;
          query?: string;
          analysisType?: AnalysisType;
        };

        const result = await analyzeCodebase({
          directory,
          query,
          analysisType: analysisType || (query ? 'custom' : 'summary'),
          ...options,
        });

        // Build response with token savings info if available
        let responseText = result.success
          ? result.answer || 'Analysis complete but no answer generated.'
          : `Error: ${result.error}`;

        if (result.success && result.tokenSavings && result.tokenSavings.savings > 0) {
          responseText += `\n\n---\n📊 Token Optimization: ${result.tokenSavings.savings}% context savings`;
        }

        return {
          content: [{
            type: 'text',
            text: responseText,
          }],
          isError: !result.success,
        };
      }

      case 'rlm_summarize': {
        const { directory } = args as { directory: string };
        const result = await summarizeCodebase(directory, options);

        return {
          content: [{
            type: 'text',
            text: result.success
              ? result.answer || 'Summary complete but no content generated.'
              : `Error: ${result.error}`,
          }],
          isError: !result.success,
        };
      }

      case 'rlm_architecture': {
        const { directory } = args as { directory: string };
        const result = await analyzeArchitecture(directory, options);

        return {
          content: [{
            type: 'text',
            text: result.success
              ? result.answer || 'Architecture analysis complete.'
              : `Error: ${result.error}`,
          }],
          isError: !result.success,
        };
      }

      case 'rlm_security': {
        const { directory } = args as { directory: string };
        const result = await analyzeSecurity(directory, options);

        return {
          content: [{
            type: 'text',
            text: result.success
              ? result.answer || 'Security analysis complete.'
              : `Error: ${result.error}`,
          }],
          isError: !result.success,
        };
      }

      case 'rlm_dependencies': {
        const { directory } = args as { directory: string };
        const result = await analyzeDependencies(directory, options);

        return {
          content: [{
            type: 'text',
            text: result.success
              ? result.answer || 'Dependency analysis complete.'
              : `Error: ${result.error}`,
          }],
          isError: !result.success,
        };
      }

      case 'rlm_refactor': {
        const { directory } = args as { directory: string };
        const result = await analyzeRefactoring(directory, options);

        return {
          content: [{
            type: 'text',
            text: result.success
              ? result.answer || 'Refactoring analysis complete.'
              : `Error: ${result.error}`,
          }],
          isError: !result.success,
        };
      }

      case 'rlm_ask': {
        const { directory, question } = args as { directory: string; question: string };
        const result = await askQuestion(directory, question, options);

        return {
          content: [{
            type: 'text',
            text: result.success
              ? result.answer || 'Question answered but no content generated.'
              : `Error: ${result.error}`,
          }],
          isError: !result.success,
        };
      }

      case 'rlm_config': {
        const config = resolveModelConfig();
        const apiKeyStatus = hasApiKey() ? 'configured' : 'NOT CONFIGURED';

        return {
          content: [{
            type: 'text',
            text: `RLM Analyzer Configuration:
- API Key: ${apiKeyStatus}
- Default Model: ${config.defaultModel} (source: ${config.defaultSource})
- Fallback Model: ${config.fallbackModel} (source: ${config.fallbackSource})

Model Aliases:
- fast → gemini-3-flash-preview
- smart → gemini-3-pro-preview
- pro → gemini-3-pro-preview`,
          }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Start server
export async function startMcpServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('RLM Analyzer MCP server running on stdio');
}

// Run directly if this file is executed
const isDirectRun = process.argv[1]?.endsWith('mcp-server.js') || process.argv[1]?.endsWith('mcp-server.ts');
if (isDirectRun) {
  startMcpServer().catch((error) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}
