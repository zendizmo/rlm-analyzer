/**
 * Configuration and API Key Management
 * Supports multiple LLM providers: Gemini (default) and Amazon Bedrock
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import type { ProviderName, LLMProvider, ProviderConfig } from './providers/types.js';
import {
  initializeProvider as initProvider,
  getProvider as getProviderInstance,
  resetProvider,
  hasProvider,
} from './providers/factory.js';

// Re-export model configuration from models.ts for backward compatibility
export {
  DEFAULT_MODEL,
  FALLBACK_MODEL,
  getDefaultModel,
  getFallbackModel,
  resolveModelConfig,
  resolveModelAlias,
  MODEL_ALIASES,
} from './models.js';

// Re-export provider types for convenience
export type { ProviderName, LLMProvider, ProviderConfig } from './providers/types.js';

// Load .env files from multiple locations
const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '.env.local'),
  path.join(os.homedir(), '.rlm-analyzer', '.env'),
  path.join(os.homedir(), '.config', 'rlm-analyzer', '.env'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

/** Cached AI client (for backward compatibility) */
let aiClient: GoogleGenAI | null = null;

/**
 * Get Gemini API key from environment or config
 * Priority:
 * 1. GEMINI_API_KEY environment variable
 * 2. RLM_API_KEY environment variable
 * 3. VITE_GEMINI_API_KEY (for Vite projects)
 * 4. Config file at ~/.rlm-analyzer/config.json
 */
export function getApiKey(): string {
  // Check environment variables
  const envKey = process.env.GEMINI_API_KEY
    || process.env.RLM_API_KEY
    || process.env.VITE_GEMINI_API_KEY;

  if (envKey) {
    return envKey;
  }

  // Check config file
  const configPaths = [
    path.join(os.homedir(), '.rlm-analyzer', 'config.json'),
    path.join(os.homedir(), '.config', 'rlm-analyzer', 'config.json'),
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.apiKey) {
          return config.apiKey;
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  throw new Error(`
Gemini API key not found. Please set it using one of these methods:

1. Environment variable:
   export GEMINI_API_KEY=your_api_key

2. .env file in your project:
   GEMINI_API_KEY=your_api_key

3. Global config file:
   mkdir -p ~/.rlm-analyzer
   echo '{"apiKey": "your_api_key"}' > ~/.rlm-analyzer/config.json

Get your API key at: https://aistudio.google.com/apikey
`);
}

/**
 * Check if Bedrock credentials are available
 * Checks for AWS credentials via environment variables or AWS profile
 */
export function hasBedrockCredentials(): boolean {
  // Check for explicit credentials
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return true;
  }

  // Check for AWS profile
  if (process.env.AWS_PROFILE) {
    return true;
  }

  // Check for default credentials file
  const credentialsPath = path.join(os.homedir(), '.aws', 'credentials');
  if (fs.existsSync(credentialsPath)) {
    return true;
  }

  return false;
}

/**
 * Detect the provider to use based on configuration priority
 * Priority:
 * 1. RLM_PROVIDER environment variable
 * 2. Config file provider setting
 * 3. Auto-detect based on available credentials
 * 4. Default to 'gemini'
 */
export function detectProvider(): ProviderName {
  // 1. Check environment variable
  const envProvider = process.env.RLM_PROVIDER?.toLowerCase();
  if (envProvider === 'gemini' || envProvider === 'bedrock') {
    return envProvider;
  }

  // 2. Check config file
  const configPaths = [
    path.join(os.homedir(), '.rlm-analyzer', 'config.json'),
    path.join(os.homedir(), '.config', 'rlm-analyzer', 'config.json'),
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.provider === 'gemini' || config.provider === 'bedrock') {
          return config.provider;
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  // 3. Auto-detect based on credentials
  // If Gemini API key is available, prefer Gemini
  if (hasApiKey()) {
    return 'gemini';
  }

  // If Bedrock credentials are available, use Bedrock
  if (hasBedrockCredentials()) {
    return 'bedrock';
  }

  // 4. Default to Gemini
  return 'gemini';
}

/**
 * Build provider configuration based on detected or specified provider
 */
function buildProviderConfig(provider: ProviderName): ProviderConfig {
  if (provider === 'bedrock') {
    return {
      provider: 'bedrock',
      region: process.env.AWS_REGION || 'us-east-1',
      profile: process.env.AWS_PROFILE,
    };
  }

  // Gemini
  return {
    provider: 'gemini',
    apiKey: getApiKey(),
  };
}

/**
 * Initialize the LLM provider
 * @param providerOverride - Optional provider to use instead of auto-detected
 * @returns The initialized provider
 */
export function initializeProvider(providerOverride?: ProviderName): LLMProvider {
  const provider = providerOverride || detectProvider();
  const config = buildProviderConfig(provider);

  // Reset any existing cached state
  resetProvider();
  aiClient = null;

  return initProvider(config);
}

/**
 * Get the cached LLM provider instance
 * Initializes with default settings if not already initialized
 * @returns The LLM provider
 */
export function getLLMProvider(): LLMProvider {
  if (!hasProvider()) {
    initializeProvider();
  }
  return getProviderInstance();
}

/**
 * Get the GoogleGenAI client instance (backward compatibility)
 * @deprecated Use getLLMProvider() instead for provider-agnostic code
 */
export function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = getApiKey();
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

/**
 * Initialize configuration directory
 */
export function initConfig(apiKey?: string, provider?: ProviderName): void {
  const configDir = path.join(os.homedir(), '.rlm-analyzer');
  const configPath = path.join(configDir, 'config.json');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  if (apiKey || provider) {
    // Read existing config
    let config: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch {
        // Ignore parse errors
      }
    }

    // Update config
    if (apiKey) {
      config.apiKey = apiKey;
    }
    if (provider) {
      config.provider = provider;
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`Configuration saved to ${configPath}`);

    // Reset cached clients so they use the new configuration
    aiClient = null;
    resetProvider();
  } else {
    console.log(`Configuration directory: ${configDir}`);
    console.log(`Config file: ${configPath}`);
  }
}

/**
 * Check if API key is configured (for Gemini)
 */
export function hasApiKey(): boolean {
  try {
    getApiKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if any provider credentials are available
 */
export function hasAnyCredentials(): boolean {
  return hasApiKey() || hasBedrockCredentials();
}

/**
 * Get current provider name
 * @returns The name of the currently active provider, or null if not initialized
 */
export function getCurrentProvider(): ProviderName | null {
  if (!hasProvider()) {
    return null;
  }
  return getProviderInstance().name;
}
