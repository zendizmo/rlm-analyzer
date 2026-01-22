/**
 * Provider Types and Interfaces
 * Abstraction layer for LLM providers (Gemini, Bedrock, etc.)
 */

/** Supported provider names */
export type ProviderName = 'gemini' | 'bedrock' | 'claude';

/** Standardized message format for conversations */
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** Options for text generation */
export interface GenerateOptions {
  /** Model ID or alias to use */
  model?: string;
  /** Temperature for generation (0-1) */
  temperature?: number;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Enable web grounding/search capability */
  enableWebGrounding?: boolean;
}

/** Grounding metadata from web search */
export interface GroundingMetadata {
  /** Web search queries that were executed */
  searchQueries?: string[];
  /** Source URLs from grounding */
  sources?: string[];
}

/** Token usage information */
export interface TokenUsage {
  /** Number of input/prompt tokens */
  inputTokens: number;
  /** Number of output/completion tokens */
  outputTokens: number;
  /** Total tokens (input + output) */
  totalTokens: number;
  /** Cache creation tokens (Claude-specific) */
  cacheCreationTokens?: number;
  /** Cache read tokens (Claude-specific) */
  cacheReadTokens?: number;
}

/** Response from text generation */
export interface GenerateResponse {
  /** Generated text content */
  text: string;
  /** Grounding/citation metadata if web search was used */
  groundingMetadata?: GroundingMetadata;
  /** Token usage information (if available from provider) */
  usage?: TokenUsage;
}

/** Provider configuration */
export interface ProviderConfig {
  /** Provider name */
  provider: ProviderName;
  /** API key - Gemini API key or Bedrock API key (AWS_BEARER_TOKEN_BEDROCK) */
  apiKey?: string;
  /** AWS region (for Bedrock, default: us-east-1) */
  region?: string;
  /** AWS profile name (for Bedrock, alternative to API key) */
  profile?: string;
}

/**
 * LLM Provider Interface
 * Abstraction for interacting with different LLM providers
 */
export interface LLMProvider {
  /** Provider name */
  readonly name: ProviderName;

  /**
   * Generate text from a single prompt
   * @param prompt - The prompt text
   * @param options - Generation options
   * @returns Generated response
   */
  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResponse>;

  /**
   * Generate text from a conversation
   * @param messages - Array of conversation messages
   * @param options - Generation options
   * @returns Generated response
   */
  generateConversation(messages: Message[], options?: GenerateOptions): Promise<GenerateResponse>;

  /**
   * Check if this provider supports web grounding
   * @returns true if web grounding is supported
   */
  supportsWebGrounding(): boolean;

  /**
   * Get the model ID that supports web grounding
   * @returns Model ID for grounding, or null if not supported
   */
  getGroundingModel(): string | null;

  /**
   * Test the connection to the provider
   * @returns true if connection is successful
   */
  testConnection(): Promise<boolean>;
}
