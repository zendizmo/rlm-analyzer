/**
 * Model Configuration Module
 * Handles model resolution with configurable priority chain
 *
 * Priority chain for model resolution:
 * 1. CLI --model flag (highest)
 * 2. Environment variables: RLM_DEFAULT_MODEL, RLM_FALLBACK_MODEL
 * 3. Config file: ~/.rlm-analyzer/config.json
 * 4. Programmatic API: createAnalyzer({ model: '...' })
 * 5. Built-in defaults (lowest, internal only)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Private built-in defaults (not exported)
// ============================================================================

const BUILTIN_DEFAULT_MODEL = 'gemini-3-flash-preview';
const BUILTIN_FALLBACK_MODEL = 'gemini-3-flash-preview';

// ============================================================================
// Model Aliases
// ============================================================================

/**
 * Model aliases for convenience
 * Users can specify aliases instead of full model IDs
 */
export const MODEL_ALIASES: Record<string, string> = {
  fast: 'gemini-3-flash-preview',
  smart: 'gemini-3-pro-preview',
  default: 'gemini-3-flash-preview',
  pro: 'gemini-3-pro-preview',
  flash: 'gemini-3-flash-preview',
  'flash-2': 'gemini-2.0-flash-exp',
  'flash-2.5': 'gemini-2.5-flash',
};

/**
 * Available model options (for display in help)
 */
export const AVAILABLE_MODELS = [
  { id: 'gemini-3-flash-preview', description: 'Gemini 3 Flash - Fast and efficient' },
  { id: 'gemini-3-pro-preview', description: 'Gemini 3 Pro - Most capable' },
  { id: 'gemini-2.5-flash', description: 'Gemini 2.5 Flash - Stable' },
  { id: 'gemini-2.0-flash-exp', description: 'Gemini 2.0 Flash - Fallback' },
];

// ============================================================================
// Model Resolution Options
// ============================================================================

export interface ModelConfigOptions {
  /** Model specified via CLI flag or programmatic API */
  model?: string;
  /** Fallback model specified via CLI flag or programmatic API */
  fallbackModel?: string;
}

export interface ResolvedModelConfig {
  /** The resolved default model ID */
  defaultModel: string;
  /** The resolved fallback model ID */
  fallbackModel: string;
  /** Source of the default model resolution */
  defaultSource: 'cli' | 'env' | 'config' | 'api' | 'builtin';
  /** Source of the fallback model resolution */
  fallbackSource: 'cli' | 'env' | 'config' | 'api' | 'builtin';
}

// ============================================================================
// Config File Reading
// ============================================================================

interface ConfigFileContent {
  apiKey?: string;
  models?: {
    default?: string;
    fallback?: string;
  };
}

/**
 * Read model configuration from config file
 */
function readConfigFile(): ConfigFileContent | null {
  const configPaths = [
    path.join(os.homedir(), '.rlm-analyzer', 'config.json'),
    path.join(os.homedir(), '.config', 'rlm-analyzer', 'config.json'),
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch {
        // Ignore parse errors
      }
    }
  }

  return null;
}

// ============================================================================
// Model Alias Resolution
// ============================================================================

/**
 * Resolve a model alias to its full model ID
 * If the input is not an alias, returns it unchanged
 *
 * @param modelOrAlias - Model ID or alias
 * @returns Full model ID
 */
export function resolveModelAlias(modelOrAlias: string): string {
  const lowercased = modelOrAlias.toLowerCase();
  return MODEL_ALIASES[lowercased] || modelOrAlias;
}

/**
 * Check if a string is a known model alias
 */
export function isModelAlias(value: string): boolean {
  return value.toLowerCase() in MODEL_ALIASES;
}

// ============================================================================
// Main Resolution Functions
// ============================================================================

/**
 * Resolve full model configuration using priority chain
 *
 * Priority:
 * 1. CLI/API options (highest)
 * 2. Environment variables: RLM_DEFAULT_MODEL, RLM_FALLBACK_MODEL
 * 3. Config file: ~/.rlm-analyzer/config.json
 * 4. Built-in defaults (lowest)
 *
 * @param options - Optional overrides from CLI or programmatic API
 * @returns Resolved model configuration with source information
 */
export function resolveModelConfig(options: ModelConfigOptions = {}): ResolvedModelConfig {
  let defaultModel: string = BUILTIN_DEFAULT_MODEL;
  let fallbackModel: string = BUILTIN_FALLBACK_MODEL;
  let defaultSource: ResolvedModelConfig['defaultSource'] = 'builtin';
  let fallbackSource: ResolvedModelConfig['fallbackSource'] = 'builtin';

  // Step 1: Start with config file (lowest priority after builtin)
  const configFile = readConfigFile();
  if (configFile) {
    const configDefault = configFile.models?.default;
    const configFallback = configFile.models?.fallback;

    if (configDefault) {
      defaultModel = resolveModelAlias(configDefault);
      defaultSource = 'config';
    }
    if (configFallback) {
      fallbackModel = resolveModelAlias(configFallback);
      fallbackSource = 'config';
    }
  }

  // Step 2: Check environment variables (higher priority)
  const envDefault = process.env.RLM_DEFAULT_MODEL;
  const envFallback = process.env.RLM_FALLBACK_MODEL;

  if (envDefault) {
    defaultModel = resolveModelAlias(envDefault);
    defaultSource = 'env';
  }
  if (envFallback) {
    fallbackModel = resolveModelAlias(envFallback);
    fallbackSource = 'env';
  }

  // Step 3: Apply CLI/API options (highest priority)
  if (options.model) {
    defaultModel = resolveModelAlias(options.model);
    defaultSource = 'cli';
  }
  if (options.fallbackModel) {
    fallbackModel = resolveModelAlias(options.fallbackModel);
    fallbackSource = 'cli';
  }

  return {
    defaultModel,
    fallbackModel,
    defaultSource,
    fallbackSource,
  };
}

/**
 * Get the default model ID using the priority chain
 * Convenience function for getting just the default model
 *
 * @param options - Optional overrides
 * @returns Resolved default model ID
 */
export function getDefaultModel(options: ModelConfigOptions = {}): string {
  return resolveModelConfig(options).defaultModel;
}

/**
 * Get the fallback model ID using the priority chain
 * Convenience function for getting just the fallback model
 *
 * @param options - Optional overrides
 * @returns Resolved fallback model ID
 */
export function getFallbackModel(options: ModelConfigOptions = {}): string {
  return resolveModelConfig(options).fallbackModel;
}

// ============================================================================
// Backward Compatibility Exports
// ============================================================================

/**
 * @deprecated Use `getDefaultModel()` instead for dynamic resolution
 * This is computed at import time and won't reflect runtime changes
 */
export const DEFAULT_MODEL = getDefaultModel();

/**
 * @deprecated Use `getFallbackModel()` instead for dynamic resolution
 * This is computed at import time and won't reflect runtime changes
 */
export const FALLBACK_MODEL = getFallbackModel();

// ============================================================================
// Display Helpers
// ============================================================================

/**
 * Get formatted string showing current model configuration
 * Useful for CLI help text and debugging
 */
export function getModelConfigDisplay(options: ModelConfigOptions = {}): string {
  const config = resolveModelConfig(options);
  const lines = [
    `Default Model: ${config.defaultModel} (from ${config.defaultSource})`,
    `Fallback Model: ${config.fallbackModel} (from ${config.fallbackSource})`,
  ];
  return lines.join('\n');
}

/**
 * Get formatted string showing available aliases
 * Useful for CLI help text
 */
export function getAliasesDisplay(): string {
  const lines = Object.entries(MODEL_ALIASES).map(
    ([alias, model]) => `  ${alias.padEnd(12)} → ${model}`
  );
  return lines.join('\n');
}
