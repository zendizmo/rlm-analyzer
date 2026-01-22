/**
 * Claude (Anthropic) Provider Implementation
 * Uses the Anthropic Messages API directly with web search support
 *
 * Authentication:
 * - ANTHROPIC_API_KEY environment variable
 * - CLAUDE_API_KEY environment variable (alias)
 * - apiKey option in constructor
 *
 * Web Search:
 * - Uses the web_search_20250305 tool type
 * - Enabled via enableWebGrounding option
 *
 * API Reference: https://docs.anthropic.com/en/api/messages
 */

import type {
  LLMProvider,
  ProviderName,
  Message,
  GenerateOptions,
  GenerateResponse,
  TokenUsage,
  GroundingMetadata,
} from './types.js';

/**
 * Default model for Claude provider
 * Can be overridden via RLM_DEFAULT_MODEL env var or --model flag
 */
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

/** Model that supports web search */
const GROUNDING_MODEL = 'claude-sonnet-4-5-20250929';

/** Anthropic API version header */
const ANTHROPIC_VERSION = '2023-06-01';

/** Anthropic API base URL */
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/** Claude message format */
interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Web search tool definition */
interface WebSearchTool {
  type: 'web_search_20250305';
  name: 'web_search';
  max_uses?: number;
}

/** Claude API request body */
interface ClaudeRequestBody {
  model: string;
  max_tokens: number;
  messages: ClaudeMessage[];
  system?: string;
  temperature?: number;
  tools?: WebSearchTool[];
}

/** Claude API response content block */
interface ClaudeContentBlock {
  type: 'text' | 'tool_use' | 'web_search_tool_result';
  text?: string;
  // Web search tool result fields
  tool_use_id?: string;
  content?: Array<{
    type: 'web_search_result';
    url: string;
    title: string;
    encrypted_content: string;
    page_age?: string;
  }>;
}

/** Claude API response */
interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/** Claude API error response */
interface ClaudeErrorResponse {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

/**
 * Convert Message[] to Claude API format
 */
function messagesToClaudeFormat(messages: Message[]): {
  system: string | undefined;
  messages: ClaudeMessage[];
} {
  let system: string | undefined;
  const claudeMessages: ClaudeMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Claude expects system as a separate field, not in messages
      // Concatenate multiple system messages if any
      system = system ? `${system}\n\n${msg.content}` : msg.content;
    } else {
      const role = msg.role === 'assistant' ? 'assistant' : 'user';
      claudeMessages.push({
        role,
        content: msg.content,
      });
    }
  }

  return { system, messages: claudeMessages };
}

/**
 * Extract grounding metadata from Claude web search response
 */
function extractGroundingMetadata(response: ClaudeResponse): GroundingMetadata | undefined {
  const sources: string[] = [];

  for (const block of response.content) {
    if (block.type === 'web_search_tool_result' && block.content) {
      for (const result of block.content) {
        if (result.type === 'web_search_result' && result.url) {
          sources.push(result.url);
        }
      }
    }
  }

  return sources.length > 0 ? { sources: [...new Set(sources)] } : undefined;
}

/**
 * Make a request to the Claude API
 */
async function callClaudeAPI(
  apiKey: string,
  body: ClaudeRequestBody
): Promise<ClaudeResponse> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorData = data as ClaudeErrorResponse;
    throw new Error(
      `Claude API error (${response.status}): ${errorData.error?.message || JSON.stringify(data)}`
    );
  }

  return data as ClaudeResponse;
}

/**
 * Claude (Anthropic) LLM Provider
 *
 * Supports authentication via:
 * 1. ANTHROPIC_API_KEY environment variable
 * 2. CLAUDE_API_KEY environment variable (alias)
 * 3. apiKey option in constructor
 *
 * Web search is supported via the web_search_20250305 tool.
 */
export class ClaudeProvider implements LLMProvider {
  readonly name: ProviderName = 'claude';
  private apiKey: string;
  private defaultModel: string;

  constructor(options: {
    /** Anthropic API key */
    apiKey?: string;
    /** Default model to use */
    defaultModel?: string;
  } = {}) {
    this.apiKey = options.apiKey
      || process.env.ANTHROPIC_API_KEY
      || process.env.CLAUDE_API_KEY
      || '';

    if (!this.apiKey) {
      throw new Error(
        'Claude provider requires an API key.\n' +
        'Set ANTHROPIC_API_KEY or CLAUDE_API_KEY environment variable,\n' +
        'or pass apiKey in the options.\n\n' +
        'Get your API key at: https://console.anthropic.com/'
      );
    }

    this.defaultModel = options.defaultModel || DEFAULT_CLAUDE_MODEL;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResponse> {
    const model = options?.model || this.defaultModel;

    const body: ClaudeRequestBody = {
      model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    // Add web search tool if enabled
    if (options?.enableWebGrounding) {
      body.tools = [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        },
      ];
    }

    const response = await callClaudeAPI(this.apiKey, body);

    // Extract text from response (filter out tool results)
    const text = response.content
      .filter((block): block is ClaudeContentBlock & { type: 'text'; text: string } =>
        block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');

    // Extract token usage
    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    };

    // Include cache tokens if present
    if (response.usage.cache_creation_input_tokens) {
      usage.cacheCreationTokens = response.usage.cache_creation_input_tokens;
    }
    if (response.usage.cache_read_input_tokens) {
      usage.cacheReadTokens = response.usage.cache_read_input_tokens;
    }

    // Extract grounding metadata if web search was used
    const groundingMetadata = options?.enableWebGrounding
      ? extractGroundingMetadata(response)
      : undefined;

    return {
      text,
      usage,
      groundingMetadata,
    };
  }

  async generateConversation(
    messages: Message[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    const model = options?.model || this.defaultModel;
    const { system, messages: claudeMessages } = messagesToClaudeFormat(messages);

    const body: ClaudeRequestBody = {
      model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: claudeMessages,
    };

    // Add system message if present
    if (system) {
      body.system = system;
    }

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    // Add web search tool if enabled
    if (options?.enableWebGrounding) {
      body.tools = [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        },
      ];
    }

    const response = await callClaudeAPI(this.apiKey, body);

    // Extract text from response (filter out tool results)
    const text = response.content
      .filter((block): block is ClaudeContentBlock & { type: 'text'; text: string } =>
        block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');

    // Extract token usage
    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    };

    // Include cache tokens if present
    if (response.usage.cache_creation_input_tokens) {
      usage.cacheCreationTokens = response.usage.cache_creation_input_tokens;
    }
    if (response.usage.cache_read_input_tokens) {
      usage.cacheReadTokens = response.usage.cache_read_input_tokens;
    }

    // Extract grounding metadata if web search was used
    const groundingMetadata = options?.enableWebGrounding
      ? extractGroundingMetadata(response)
      : undefined;

    return {
      text,
      usage,
      groundingMetadata,
    };
  }

  supportsWebGrounding(): boolean {
    // Claude supports web search via the web_search_20250305 tool
    return true;
  }

  getGroundingModel(): string {
    return GROUNDING_MODEL;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.generate('Say "ok"', {
        maxTokens: 10,
        temperature: 0.1,
      });
      return response.text.length > 0;
    } catch {
      return false;
    }
  }
}
