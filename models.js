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
export const MODEL_ALIASES = {
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
 * Model IDs from:
 * - Gemini: https://ai.google.dev/gemini-api/docs/models
 * - Bedrock: https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html
 * - Claude: https://docs.anthropic.com/en/docs/about-claude/models
 */
export const PROVIDER_MODEL_ALIASES = {
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
        // Convenient aliases - Nova 2 Lite as default (latest Nova)
        fast: 'us.amazon.nova-2-lite-v1:0',
        smart: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        default: 'us.amazon.nova-2-lite-v1:0',
        grounding: 'us.amazon.nova-2-lite-v1:0', // Nova 2 Lite supports web grounding
        // Claude 4.5 (latest generation) - require inference profile (us. prefix)
        'claude-4.5-sonnet': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        'claude-4.5-opus': 'us.anthropic.claude-opus-4-5-20251101-v1:0',
        'claude-4.5-haiku': 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        'claude-sonnet': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        'claude-opus': 'us.anthropic.claude-opus-4-5-20251101-v1:0',
        'claude-haiku': 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        // Claude 4.x - require inference profile
        'claude-4-sonnet': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
        'claude-4.1-opus': 'us.anthropic.claude-opus-4-1-20250805-v1:0',
        // Claude 3.5 - require inference profile
        'claude-3.5-haiku': 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
        // Claude 3 - on-demand supported
        'claude-3-haiku': 'anthropic.claude-3-haiku-20240307-v1:0',
        // Amazon Nova - on-demand supported
        'nova-micro': 'amazon.nova-micro-v1:0',
        'nova-lite': 'amazon.nova-lite-v1:0',
        'nova-pro': 'amazon.nova-pro-v1:0',
        'nova-premier': 'amazon.nova-premier-v1:0',
        // Amazon Nova 2 - require inference profile (Nova 2 Pro is in preview only)
        'nova-2-lite': 'us.amazon.nova-2-lite-v1:0',
        'nova-sonic': 'us.amazon.nova-sonic-v1:0',
        'nova-2-sonic': 'us.amazon.nova-2-sonic-v1:0',
        // Meta Llama 4 - require inference profile
        'llama-4-maverick': 'us.meta.llama4-maverick-17b-instruct-v1:0',
        'llama-4-scout': 'us.meta.llama4-scout-17b-instruct-v1:0',
        'llama-4': 'us.meta.llama4-maverick-17b-instruct-v1:0',
        // Meta Llama 3.x - on-demand supported
        'llama-3.3': 'meta.llama3-3-70b-instruct-v1:0',
        'llama-3.2-90b': 'meta.llama3-2-90b-instruct-v1:0',
        'llama-3.1-405b': 'meta.llama3-1-405b-instruct-v1:0',
        'llama-3.1-70b': 'meta.llama3-1-70b-instruct-v1:0',
        // Mistral - on-demand supported
        'mistral-large': 'mistral.mistral-large-2407-v1:0',
        'mistral-large-3': 'us.mistral.mistral-large-3-675b-instruct',
        'magistral-small': 'us.mistral.magistral-small-2509',
        'pixtral-large': 'us.mistral.pixtral-large-2502-v1:0',
        // Qwen (Alibaba) - on-demand supported (no us. prefix)
        'qwen3': 'qwen.qwen3-235b-a22b-2507-v1:0',
        'qwen3-235b': 'qwen.qwen3-235b-a22b-2507-v1:0',
        'qwen3-32b': 'qwen.qwen3-32b-v1:0',
        'qwen3-coder': 'qwen.qwen3-coder-30b-a3b-v1:0',
        'qwen3-coder-30b': 'qwen.qwen3-coder-30b-a3b-v1:0',
        'qwen3-next': 'qwen.qwen3-next-80b-a3b',
        'qwen3-vl': 'qwen.qwen3-vl-235b-a22b',
        // OpenAI GPT (Open Source) - on-demand supported (no us. prefix)
        'gpt-oss': 'openai.gpt-oss-120b-1:0',
        'gpt-oss-120b': 'openai.gpt-oss-120b-1:0',
        'gpt-oss-20b': 'openai.gpt-oss-20b-1:0',
    },
    claude: {
        // Convenient aliases
        fast: 'claude-haiku-4-5-20251001',
        smart: 'claude-sonnet-4-5-20250929',
        default: 'claude-sonnet-4-5-20250929',
        // Claude 4.5 (Latest generation)
        'sonnet': 'claude-sonnet-4-5-20250929',
        'opus': 'claude-opus-4-5-20251101',
        'haiku': 'claude-haiku-4-5-20251001',
        'claude-sonnet': 'claude-sonnet-4-5-20250929',
        'claude-opus': 'claude-opus-4-5-20251101',
        'claude-haiku': 'claude-haiku-4-5-20251001',
        'claude-4.5-sonnet': 'claude-sonnet-4-5-20250929',
        'claude-4.5-opus': 'claude-opus-4-5-20251101',
        'claude-4.5-haiku': 'claude-haiku-4-5-20251001',
        // Claude 4.x
        'claude-4-sonnet': 'claude-sonnet-4-20250514',
        'claude-4.1-opus': 'claude-opus-4-1-20250805',
        // Claude 3.5
        'claude-3.5-sonnet': 'claude-3-5-sonnet-20241022',
        'claude-3.5-haiku': 'claude-3-5-haiku-20241022',
        // Claude 3
        'claude-3-opus': 'claude-3-opus-20240229',
        'claude-3-sonnet': 'claude-3-sonnet-20240229',
        'claude-3-haiku': 'claude-3-haiku-20240307',
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
 * Note: Models with us. prefix require inference profiles for on-demand usage
 * Full list: https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html
 */
export const AVAILABLE_BEDROCK_MODELS = [
    // Claude 4.5 (Latest generation) - require inference profile
    { id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', description: 'Claude 4.5 Sonnet - Latest, recommended' },
    { id: 'us.anthropic.claude-opus-4-5-20251101-v1:0', description: 'Claude 4.5 Opus - Most capable' },
    { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', description: 'Claude 4.5 Haiku - Fast' },
    // Claude 4.x - require inference profile
    { id: 'us.anthropic.claude-sonnet-4-20250514-v1:0', description: 'Claude 4 Sonnet' },
    { id: 'us.anthropic.claude-opus-4-1-20250805-v1:0', description: 'Claude 4.1 Opus' },
    // Claude 3 - on-demand supported
    { id: 'anthropic.claude-3-haiku-20240307-v1:0', description: 'Claude 3 Haiku - On-demand' },
    // Amazon Nova - on-demand supported
    { id: 'amazon.nova-micro-v1:0', description: 'Nova Micro - Ultra fast, on-demand' },
    { id: 'amazon.nova-lite-v1:0', description: 'Nova Lite - Fast, on-demand' },
    { id: 'amazon.nova-pro-v1:0', description: 'Nova Pro - Balanced, on-demand' },
    { id: 'amazon.nova-premier-v1:0', description: 'Nova Premier - On-demand' },
    // Amazon Nova 2 - require inference profile (with web grounding support)
    // Note: Nova 2 Pro is in preview only and not generally available
    { id: 'us.amazon.nova-2-lite-v1:0', description: 'Nova 2 Lite - Web grounding (default)' },
    // Meta Llama 4 - require inference profile
    { id: 'us.meta.llama4-maverick-17b-instruct-v1:0', description: 'Llama 4 Maverick 17B' },
    { id: 'us.meta.llama4-scout-17b-instruct-v1:0', description: 'Llama 4 Scout 17B' },
    // Meta Llama 3.x - on-demand supported
    { id: 'meta.llama3-3-70b-instruct-v1:0', description: 'Llama 3.3 70B - On-demand' },
    { id: 'meta.llama3-1-405b-instruct-v1:0', description: 'Llama 3.1 405B - Largest' },
    // Mistral - on-demand and inference profile
    { id: 'mistral.mistral-large-2407-v1:0', description: 'Mistral Large 2407 - On-demand' },
    { id: 'us.mistral.mistral-large-3-675b-instruct', description: 'Mistral Large 3 675B - Latest' },
    // Qwen (Alibaba) - on-demand supported
    { id: 'qwen.qwen3-coder-30b-a3b-v1:0', description: 'Qwen3 Coder 30B - Best for coding' },
    { id: 'qwen.qwen3-235b-a22b-2507-v1:0', description: 'Qwen3 235B - General purpose' },
    { id: 'qwen.qwen3-vl-235b-a22b', description: 'Qwen3 VL 235B - Vision' },
    // OpenAI GPT (Open Source) - on-demand supported
    { id: 'openai.gpt-oss-120b-1:0', description: 'GPT OSS 120B - General purpose' },
    { id: 'openai.gpt-oss-20b-1:0', description: 'GPT OSS 20B - Fast' },
];
/**
 * Note: Any valid Bedrock model ID can be passed via --model flag
 * The aliases above are just shortcuts for common models
 * Full list: https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html
 */
/**
 * Available Claude models (for display in help)
 * Full list: https://docs.anthropic.com/en/docs/about-claude/models
 */
export const AVAILABLE_CLAUDE_MODELS = [
    // Claude 4.5 (Latest generation)
    { id: 'claude-sonnet-4-5-20250929', description: 'Claude 4.5 Sonnet - Balanced (default)' },
    { id: 'claude-opus-4-5-20251101', description: 'Claude 4.5 Opus - Most capable' },
    { id: 'claude-haiku-4-5-20251001', description: 'Claude 4.5 Haiku - Fast' },
    // Claude 4.x
    { id: 'claude-sonnet-4-20250514', description: 'Claude 4 Sonnet' },
    { id: 'claude-opus-4-1-20250805', description: 'Claude 4.1 Opus' },
    // Claude 3.5
    { id: 'claude-3-5-sonnet-20241022', description: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022', description: 'Claude 3.5 Haiku' },
    // Claude 3
    { id: 'claude-3-opus-20240229', description: 'Claude 3 Opus' },
    { id: 'claude-3-sonnet-20240229', description: 'Claude 3 Sonnet' },
    { id: 'claude-3-haiku-20240307', description: 'Claude 3 Haiku' },
];
/**
 * Get available models for a specific provider
 */
export function getAvailableModelsForProvider(provider) {
    switch (provider) {
        case 'bedrock':
            return AVAILABLE_BEDROCK_MODELS;
        case 'claude':
            return AVAILABLE_CLAUDE_MODELS;
        default:
            return AVAILABLE_MODELS;
    }
}
/**
 * Read model configuration from config file
 */
function readConfigFile() {
    const configPaths = [
        path.join(os.homedir(), '.rlm-analyzer', 'config.json'),
        path.join(os.homedir(), '.config', 'rlm-analyzer', 'config.json'),
    ];
    for (const configPath of configPaths) {
        if (fs.existsSync(configPath)) {
            try {
                return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            }
            catch {
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
export function resolveModelAlias(modelOrAlias) {
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
export function resolveProviderModelAlias(modelOrAlias, provider) {
    const lowercased = modelOrAlias.toLowerCase();
    const providerAliases = PROVIDER_MODEL_ALIASES[provider];
    return providerAliases?.[lowercased] || modelOrAlias;
}
/**
 * Check if a string is a known model alias
 */
export function isModelAlias(value) {
    return value.toLowerCase() in MODEL_ALIASES;
}
/**
 * Check if a string is a known model alias for a specific provider
 */
export function isProviderModelAlias(value, provider) {
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
export function resolveModelConfig(options = {}) {
    const provider = options.provider || 'gemini';
    const resolveAlias = (alias) => resolveProviderModelAlias(alias, provider);
    // Get default model based on provider
    let defaultModel;
    let fallbackModel;
    switch (provider) {
        case 'bedrock':
            defaultModel = PROVIDER_MODEL_ALIASES.bedrock.default;
            fallbackModel = PROVIDER_MODEL_ALIASES.bedrock.fast;
            break;
        case 'claude':
            defaultModel = PROVIDER_MODEL_ALIASES.claude.default;
            fallbackModel = PROVIDER_MODEL_ALIASES.claude.fast;
            break;
        default:
            defaultModel = BUILTIN_DEFAULT_MODEL;
            fallbackModel = BUILTIN_FALLBACK_MODEL;
    }
    let defaultSource = 'builtin';
    let fallbackSource = 'builtin';
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
export function getDefaultModel(options = {}) {
    return resolveModelConfig(options).defaultModel;
}
/**
 * Get the fallback model ID using the priority chain
 * Convenience function for getting just the fallback model
 *
 * @param options - Optional overrides
 * @returns Resolved fallback model ID
 */
export function getFallbackModel(options = {}) {
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
export function getModelConfigDisplay(options = {}) {
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
export function getAliasesDisplay(provider) {
    const aliases = provider ? PROVIDER_MODEL_ALIASES[provider] : MODEL_ALIASES;
    const lines = Object.entries(aliases).map(([alias, model]) => `  ${alias.padEnd(14)} → ${model}`);
    return lines.join('\n');
}
/**
 * Get formatted string showing available aliases for a provider
 * Useful for CLI help text
 */
export function getProviderAliasesDisplay(provider) {
    return getAliasesDisplay(provider);
}
