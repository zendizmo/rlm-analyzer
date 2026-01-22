/**
 * Gemini Provider Implementation
 * Wraps @google/genai SDK for the LLMProvider interface
 */

import { GoogleGenAI, type Content } from '@google/genai';
import type {
  LLMProvider,
  ProviderName,
  Message,
  GenerateOptions,
  GenerateResponse,
  GroundingMetadata,
} from './types.js';

/** Default model for Gemini provider */
const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';

/** Model that supports web grounding */
const GROUNDING_MODEL = 'gemini-3-flash-preview';

/**
 * Convert Message[] to Gemini Content[] format
 */
function messagesToContents(messages: Message[]): Content[] {
  const contents: Content[] = [];
  let systemPrompt = '';

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Accumulate system messages to prepend to first user message
      systemPrompt += (systemPrompt ? '\n\n' : '') + msg.content;
    } else {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      let text = msg.content;

      // Prepend system prompt to first user message
      if (role === 'user' && systemPrompt && contents.length === 0) {
        text = `${systemPrompt}\n\n${text}`;
        systemPrompt = '';
      }

      contents.push({ role, parts: [{ text }] });
    }
  }

  // If we only had system messages, add them as a user message
  if (systemPrompt && contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
  }

  return contents;
}

/**
 * Extract grounding metadata from Gemini response
 */
function extractGroundingMetadata(response: unknown): GroundingMetadata | undefined {
  // Type-safe extraction from response.candidates[0].groundingMetadata
  const metadata = (response as {
    candidates?: Array<{
      groundingMetadata?: {
        webSearchQueries?: string[];
        groundingChunks?: Array<{
          web?: { uri?: string };
        }>;
      };
    }>;
  })?.candidates?.[0]?.groundingMetadata;

  if (!metadata) return undefined;

  const result: GroundingMetadata = {};

  if (metadata.webSearchQueries) {
    result.searchQueries = metadata.webSearchQueries;
  }

  if (metadata.groundingChunks) {
    result.sources = metadata.groundingChunks
      .filter((chunk) => chunk.web?.uri)
      .map((chunk) => chunk.web!.uri!);
  }

  return result.searchQueries || result.sources ? result : undefined;
}

/**
 * Gemini LLM Provider
 */
export class GeminiProvider implements LLMProvider {
  readonly name: ProviderName = 'gemini';
  private client: GoogleGenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel?: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.defaultModel = defaultModel || DEFAULT_GEMINI_MODEL;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResponse> {
    const model = options?.model || this.defaultModel;

    const config: Record<string, unknown> = {
      temperature: options?.temperature ?? 0.7,
      maxOutputTokens: options?.maxTokens ?? 4096,
    };

    // Add web grounding tool if enabled
    if (options?.enableWebGrounding) {
      (config as { tools?: unknown[] }).tools = [{ googleSearch: {} }];
    }

    const response = await this.client.models.generateContent({
      model,
      contents: prompt,
      config,
    });

    return {
      text: response.text || '',
      groundingMetadata: extractGroundingMetadata(response),
    };
  }

  async generateConversation(
    messages: Message[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    const model = options?.model || this.defaultModel;
    const contents = messagesToContents(messages);

    const config: Record<string, unknown> = {
      temperature: options?.temperature ?? 0.7,
      maxOutputTokens: options?.maxTokens ?? 4096,
    };

    // Add web grounding tool if enabled
    if (options?.enableWebGrounding) {
      (config as { tools?: unknown[] }).tools = [{ googleSearch: {} }];
    }

    const response = await this.client.models.generateContent({
      model,
      contents,
      config,
    });

    return {
      text: response.text || '',
      groundingMetadata: extractGroundingMetadata(response),
    };
  }

  supportsWebGrounding(): boolean {
    return true;
  }

  getGroundingModel(): string {
    return GROUNDING_MODEL;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.models.generateContent({
        model: this.defaultModel,
        contents: 'Say "ok"',
        config: {
          temperature: 0.1,
          maxOutputTokens: 10,
        },
      });
      return !!response.text;
    } catch {
      return false;
    }
  }

  /**
   * Get the underlying GoogleGenAI client for direct access
   * (backward compatibility)
   */
  getClient(): GoogleGenAI {
    return this.client;
  }
}
