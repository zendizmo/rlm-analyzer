/**
 * Configuration and API Key Management
 * Supports multiple ways to provide the Gemini API key
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

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

/** Cached AI client */
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
 * Get the GoogleGenAI client instance
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
export function initConfig(apiKey?: string): void {
  const configDir = path.join(os.homedir(), '.rlm-analyzer');
  const configPath = path.join(configDir, 'config.json');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  if (apiKey) {
    fs.writeFileSync(configPath, JSON.stringify({ apiKey }, null, 2));
    console.log(`Configuration saved to ${configPath}`);
    // Reset cached client so it uses the new key
    aiClient = null;
  } else {
    console.log(`Configuration directory: ${configDir}`);
    console.log(`Config file: ${configPath}`);
  }
}

/**
 * Check if API key is configured
 */
export function hasApiKey(): boolean {
  try {
    getApiKey();
    return true;
  } catch {
    return false;
  }
}
