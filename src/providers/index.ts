/**
 * Provider Module Exports
 * LLM provider abstraction layer supporting Gemini and Bedrock
 */

// Types
export type {
  ProviderName,
  Message,
  GenerateOptions,
  GenerateResponse,
  GroundingMetadata,
  ProviderConfig,
  LLMProvider,
} from './types.js';

// Provider implementations
export { GeminiProvider } from './gemini.js';
export { BedrockProvider } from './bedrock.js';

// Factory functions
export {
  createProvider,
  getProvider,
  initializeProvider,
  resetProvider,
  hasProvider,
  getProviderName,
  getProviderConfig,
} from './factory.js';
