/**
 * Provider Factory
 * Creates and caches LLM providers based on configuration
 */

import type { LLMProvider, ProviderName, ProviderConfig } from './types.js';
import { GeminiProvider } from './gemini.js';
import { BedrockProvider } from './bedrock.js';

/** Cached provider instance */
let cachedProvider: LLMProvider | null = null;

/** Current provider configuration */
let currentConfig: ProviderConfig | null = null;

/**
 * Create an LLM provider based on configuration
 * @param config - Provider configuration
 * @returns LLM provider instance
 */
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.provider) {
    case 'gemini':
      if (!config.apiKey) {
        throw new Error('Gemini provider requires an API key');
      }
      return new GeminiProvider(config.apiKey);

    case 'bedrock':
      return new BedrockProvider({
        region: config.region,
        profile: config.profile,
        apiKey: config.apiKey, // Bedrock API key (AWS_BEARER_TOKEN_BEDROCK)
      });

    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

/**
 * Get the cached provider instance
 * Throws if no provider has been initialized
 * @returns The cached LLM provider
 */
export function getProvider(): LLMProvider {
  if (!cachedProvider) {
    throw new Error(
      'No LLM provider initialized. Call initializeProvider() first, or use createProvider() directly.'
    );
  }
  return cachedProvider;
}

/**
 * Initialize and cache a provider
 * @param config - Provider configuration
 * @returns The initialized provider
 */
export function initializeProvider(config: ProviderConfig): LLMProvider {
  cachedProvider = createProvider(config);
  currentConfig = config;
  return cachedProvider;
}

/**
 * Reset the cached provider
 * Useful for testing or switching providers
 */
export function resetProvider(): void {
  cachedProvider = null;
  currentConfig = null;
}

/**
 * Check if a provider is initialized
 * @returns true if a provider is initialized
 */
export function hasProvider(): boolean {
  return cachedProvider !== null;
}

/**
 * Get the current provider name
 * @returns Provider name or null if not initialized
 */
export function getProviderName(): ProviderName | null {
  return cachedProvider?.name ?? null;
}

/**
 * Get the current provider configuration
 * @returns Provider config or null if not initialized
 */
export function getProviderConfig(): ProviderConfig | null {
  return currentConfig;
}
