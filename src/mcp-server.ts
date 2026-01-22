#!/usr/bin/env node
/**
 * RLM Analyzer MCP Server
 * Exposes RLM analysis capabilities via Model Context Protocol
 * Supports both Gemini and Amazon Bedrock providers
 *
 * Usage with Claude Code:
 * Add to ~/.claude/claude_desktop_config.json:
 *
 * For Gemini (default):
 * {
 *   "mcpServers": {
 *     "rlm-analyzer": {
 *       "command": "npx",
 *       "args": ["rlm-analyzer-mcp"],
 *       "env": { "GEMINI_API_KEY": "your_key" }
 *     }
 *   }
 * }
 *
 * For Amazon Bedrock:
 * {
 *   "mcpServers": {
 *     "rlm-analyzer": {
 *       "command": "npx",
 *       "args": ["rlm-analyzer-mcp"],
 *       "env": {
 *         "RLM_PROVIDER": "bedrock",
 *         "AWS_REGION": "us-east-1",
 *         "AWS_ACCESS_KEY_ID": "your_key",
 *         "AWS_SECRET_ACCESS_KEY": "your_secret"
 *       }
 *     }
 *   }
 * }
 */

import { fileURLToPath } from 'url';
import { realpathSync } from 'fs';
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
import { resolveModelConfig, resolveProviderModelAlias, getProviderAliasesDisplay } from './models.js';
import { hasApiKey, hasAnyCredentials, initializeProvider, hasBedrockCredentials } from './config.js';
import type { AnalysisType } from './types.js';
import type { ProviderName } from './providers/types.js';

// Provider parameter common to all analysis tools
const PROVIDER_PARAM = {
  type: 'string',
  enum: ['gemini', 'bedrock'],
  description: 'LLM provider to use (default: gemini). Bedrock requires AWS credentials.',
};

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
        provider: PROVIDER_PARAM,
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
        provider: PROVIDER_PARAM,
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
        provider: PROVIDER_PARAM,
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
        provider: PROVIDER_PARAM,
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
        provider: PROVIDER_PARAM,
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
        provider: PROVIDER_PARAM,
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
        provider: PROVIDER_PARAM,
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
  { name: 'rlm-analyzer', version: '1.4.0' },
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
    // Get provider from args or default to gemini
    const provider = (args?.provider as ProviderName) || 'gemini';

    // Check credentials for analysis tools
    if (name !== 'rlm_config' && !hasAnyCredentials()) {
      const errorMsg = provider === 'bedrock'
        ? 'Error: AWS credentials not configured. Set AWS_BEARER_TOKEN_BEDROCK (recommended), or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, or AWS_PROFILE.'
        : 'Error: GEMINI_API_KEY not configured. Set it in the MCP server environment.';
      return {
        content: [{
          type: 'text',
          text: errorMsg,
        }],
        isError: true,
      };
    }

    // Initialize provider for analysis tools
    if (name !== 'rlm_config') {
      initializeProvider(provider);
    }

    // Resolve model alias using provider-specific resolution
    const model = args?.model ? resolveProviderModelAlias(args.model as string, provider) : undefined;
    const options = { ...(model ? { model } : {}), provider };

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
        const geminiConfig = resolveModelConfig({ provider: 'gemini' });
        const bedrockConfig = resolveModelConfig({ provider: 'bedrock' });
        const geminiStatus = hasApiKey() ? 'configured' : 'NOT CONFIGURED';
        const bedrockStatus = hasBedrockCredentials() ? 'configured' : 'NOT CONFIGURED';

        return {
          content: [{
            type: 'text',
            text: `RLM Analyzer Configuration:

Gemini Provider:
- API Key: ${geminiStatus}
- Default Model: ${geminiConfig.defaultModel} (source: ${geminiConfig.defaultSource})
- Fallback Model: ${geminiConfig.fallbackModel} (source: ${geminiConfig.fallbackSource})
- Aliases:
${getProviderAliasesDisplay('gemini')}

Bedrock Provider:
- AWS Credentials: ${bedrockStatus}
- Default Model: ${bedrockConfig.defaultModel} (source: ${bedrockConfig.defaultSource})
- Fallback Model: ${bedrockConfig.fallbackModel} (source: ${bedrockConfig.fallbackSource})
- Aliases:
${getProviderAliasesDisplay('bedrock')}

Use 'provider' parameter to switch between providers.`,
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

// Auto-start when run as a script (via node, npx, or bin symlink)
// Use import.meta.url to detect if we're the main module
function isMainModule(): boolean {
  try {
    const scriptPath = process.argv[1];
    if (!scriptPath) return false;

    // Get the real path of this file
    const thisFile = fileURLToPath(import.meta.url);

    // Get real paths to resolve symlinks (npx creates symlinks in .bin/)
    const realScript = realpathSync(scriptPath);
    const realThis = realpathSync(thisFile);

    return realScript === realThis;
  } catch {
    // Fallback: check if script path contains our identifiers
    const scriptPath = process.argv[1] || '';
    return (
      scriptPath.endsWith('mcp-server.js') ||
      scriptPath.endsWith('rlm-mcp') ||
      scriptPath.endsWith('rlm-analyzer-mcp')
    );
  }
}

if (isMainModule()) {
  startMcpServer().catch((error) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}
