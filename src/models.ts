/**
 * Model Configuration Module
 * Handles model resolution with configurable priority chain
 * Supports multiple providers: Gemini (default) and Amazon Bedrock
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
import type { ProviderName } from './providers/types.js';

// ============================================================================
// Private built-in defaults (not exported)
// ============================================================================

const BUILTIN_DEFAULT_MODEL = 'gemini-3-flash-preview';
const BUILTIN_FALLBACK_MODEL = 'gemini-3-flash-preview';

// ============================================================================
// Model Aliases (Gemini - default/backward compatible)
// ============================================================================

/**
 * Model aliases for convenience (Gemini provider)
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
 * Provider-specific model aliases
 */
export const PROVIDER_MODEL_ALIASES: Record<ProviderName, Record<string, string>> = {
  gemini: {
    fast: 'gemini-3-flash-preview',
    smart: 'gemini-3-pro-preview',
    default: 'gemini-3-flash-preview',
    pro: 'gemini-3-pro-preview',
    flash: 'gemini-3-flash-preview',
    'flash-2': 'gemini-2.0-flash-exp',
    'flash-2.5': 'gemini-2.5-flash',
    grounding: 'gemini-3-flash-preview',
  },
  bedrock: {
    fast: 'amazon.nova-lite-v1:0',
    smart: 'amazon.nova-pro-v1:0',
    default: 'amazon.nova-lite-v1:0',
    premier: 'us.amazon.nova-premier-v1:0',
    grounding: 'us.amazon.nova-premier-v1:0',
    'nova-lite': 'amazon.nova-lite-v1:0',
    'nova-pro': 'amazon.nova-pro-v1:0',
    'nova-premier': 'us.amazon.nova-premier-v1:0',
    'claude-haiku': 'anthropic.claude-3-haiku-20240307-v1:0',
    'claude-sonnet': 'anthropic.claude-3-sonnet-20240229-v1:0',
    'claude-opus': 'anthropic.claude-3-opus-20240229-v1:0',
  },
};

/**
 * Available model options (for display in help) - Gemini
 */
export const AVAILABLE_MODELS = [
  { id: 'gemini-3-flash-preview', description: 'Gemini 3 Flash - Fast and efficient' },
  { id: 'gemini-3-pro-preview', description: 'Gemini 3 Pro - Most capable' },
  { id: 'gemini-2.5-flash', description: 'Gemini 2.5 Flash - Stable' },
  { id: 'gemini-2.0-flash-exp', description: 'Gemini 2.0 Flash - Fallback' },
];

/**
 * Available Bedrock models (for display in help)
 */
export const AVAILABLE_BEDROCK_MODELS = [
  { id: 'amazon.nova-lite-v1:0', description: 'Nova Lite - Fast, cost-effective' },
  { id: 'amazon.nova-pro-v1:0', description: 'Nova Pro - Balanced performance' },
  { id: 'us.amazon.nova-premier-v1:0', description: 'Nova Premier - Most capable, web grounding' },
  { id: 'anthropic.claude-3-haiku-20240307-v1:0', description: 'Claude 3 Haiku - Fast Claude' },
  { id: 'anthropic.claude-3-sonnet-20240229-v1:0', description: 'Claude 3 Sonnet - Balanced Claude' },
  { id: 'anthropic.claude-3-opus-20240229-v1:0', description: 'Claude 3 Opus - Most capable Claude' },
];

/**
 * Get available models for a specific provider
 */
export function getAvailableModelsForProvider(provider: ProviderName): typeof AVAILABLE_MODELS {
  return provider === 'bedrock' ? AVAILABLE_BEDROCK_MODELS : AVAILABLE_MODELS;
}

// ============================================================================
// Model Resolution Options
// ============================================================================

export interface ModelConfigOptions {
  /** Model specified via CLI flag or programmatic API */
  model?: string;
  /** Fallback model specified via CLI flag or programmatic API */
  fallbackModel?: string;
  /** Provider to use for model alias resolution */
  provider?: ProviderName;
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
  provider?: ProviderName;
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
 * Resolve a model alias to its full model ID (Gemini default)
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
 * Resolve a model alias to its full model ID for a specific provider
 * If the input is not an alias, returns it unchanged
 *
 * @param modelOrAlias - Model ID or alias
 * @param provider - Provider to use for resolution
 * @returns Full model ID
 */
export function resolveProviderModelAlias(modelOrAlias: string, provider: ProviderName): string {
  const lowercased = modelOrAlias.toLowerCase();
  const providerAliases = PROVIDER_MODEL_ALIASES[provider];
  return providerAliases?.[lowercased] || modelOrAlias;
}

/**
 * Check if a string is a known model alias
 */
export function isModelAlias(value: string): boolean {
  return value.toLowerCase() in MODEL_ALIASES;
}

/**
 * Check if a string is a known model alias for a specific provider
 */
export function isProviderModelAlias(value: string, provider: ProviderName): boolean {
  const lowercased = value.toLowerCase();
  return lowercased in (PROVIDER_MODEL_ALIASES[provider] || {});
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
  const provider = options.provider || 'gemini';
  const resolveAlias = (alias: string) => resolveProviderModelAlias(alias, provider);

  let defaultModel: string = provider === 'bedrock'
    ? PROVIDER_MODEL_ALIASES.bedrock.default
    : BUILTIN_DEFAULT_MODEL;
  let fallbackModel: string = provider === 'bedrock'
    ? PROVIDER_MODEL_ALIASES.bedrock.fast
    : BUILTIN_FALLBACK_MODEL;
  let defaultSource: ResolvedModelConfig['defaultSource'] = 'builtin';
  let fallbackSource: ResolvedModelConfig['fallbackSource'] = 'builtin';

  // Step 1: Start with config file (lowest priority after builtin)
  const configFile = readConfigFile();
  if (configFile) {
    const configDefault = configFile.models?.default;
    const configFallback = configFile.models?.fallback;

    if (configDefault) {
      defaultModel = resolveAlias(configDefault);
      defaultSource = 'config';
    }
    if (configFallback) {
      fallbackModel = resolveAlias(configFallback);
      fallbackSource = 'config';
    }
  }

  // Step 2: Check environment variables (higher priority)
  const envDefault = process.env.RLM_DEFAULT_MODEL;
  const envFallback = process.env.RLM_FALLBACK_MODEL;

  if (envDefault) {
    defaultModel = resolveAlias(envDefault);
    defaultSource = 'env';
  }
  if (envFallback) {
    fallbackModel = resolveAlias(envFallback);
    fallbackSource = 'env';
  }

  // Step 3: Apply CLI/API options (highest priority)
  if (options.model) {
    defaultModel = resolveAlias(options.model);
    defaultSource = 'cli';
  }
  if (options.fallbackModel) {
    fallbackModel = resolveAlias(options.fallbackModel);
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
export function getAliasesDisplay(provider?: ProviderName): string {
  const aliases = provider ? PROVIDER_MODEL_ALIASES[provider] : MODEL_ALIASES;
  const lines = Object.entries(aliases).map(
    ([alias, model]) => `  ${alias.padEnd(14)} → ${model}`
  );
  return lines.join('\n');
}

/**
 * Get formatted string showing available aliases for a provider
 * Useful for CLI help text
 */
export function getProviderAliasesDisplay(provider: ProviderName): string {
  return getAliasesDisplay(provider);
}
