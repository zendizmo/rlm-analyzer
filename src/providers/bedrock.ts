/**
 * Amazon Bedrock Provider Implementation
 * Uses the Converse API with support for Nova Premier web grounding
 */

import type {
  LLMProvider,
  ProviderName,
  Message,
  GenerateOptions,
  GenerateResponse,
  GroundingMetadata,
} from './types.js';

/** Default model for Bedrock provider */
const DEFAULT_BEDROCK_MODEL = 'amazon.nova-lite-v1:0';

/** Model that supports web grounding (Nova Premier) */
const GROUNDING_MODEL = 'us.amazon.nova-premier-v1:0';

/** Default AWS region */
const DEFAULT_REGION = 'us-east-1';

/** Bedrock message format */
interface BedrockMessage {
  role: 'user' | 'assistant';
  content: Array<{ text: string }>;
}

/** Bedrock system content block */
interface SystemContentBlock {
  text: string;
}

/**
 * Dynamically import the AWS SDK
 * This allows the package to work without the SDK installed (Gemini-only users)
 */
async function loadBedrockSDK(): Promise<{
  BedrockRuntimeClient: new (config: { region: string }) => {
    send: (command: unknown) => Promise<unknown>;
  };
  ConverseCommand: new (input: unknown) => unknown;
}> {
  try {
    // Dynamic import - will fail if package not installed
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Optional dependency, may not be installed
    const sdk = await import('@aws-sdk/client-bedrock-runtime');
    return {
      BedrockRuntimeClient: sdk.BedrockRuntimeClient as unknown as new (config: { region: string }) => {
        send: (command: unknown) => Promise<unknown>;
      },
      ConverseCommand: sdk.ConverseCommand as unknown as new (input: unknown) => unknown,
    };
  } catch (error) {
    throw new Error(
      'Amazon Bedrock provider requires @aws-sdk/client-bedrock-runtime.\n' +
      'Install it with: npm install @aws-sdk/client-bedrock-runtime\n\n' +
      'Original error: ' + (error instanceof Error ? error.message : String(error))
    );
  }
}

/**
 * Convert Message[] to Bedrock Converse API format
 */
function messagesToBedrockFormat(messages: Message[]): {
  system: SystemContentBlock[];
  messages: BedrockMessage[];
} {
  const system: SystemContentBlock[] = [];
  const bedrockMessages: BedrockMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system.push({ text: msg.content });
    } else {
      const role = msg.role === 'assistant' ? 'assistant' : 'user';
      bedrockMessages.push({
        role,
        content: [{ text: msg.content }],
      });
    }
  }

  return { system, messages: bedrockMessages };
}

/**
 * Extract grounding metadata from Bedrock response
 * Nova Premier includes citations in content[].citationsContent
 */
function extractGroundingMetadata(response: unknown): GroundingMetadata | undefined {
  // Type-safe extraction from response.output.message.content
  const content = (response as {
    output?: {
      message?: {
        content?: Array<{
          citationsContent?: {
            citations?: Array<{
              location?: {
                web?: { url?: string };
              };
            }>;
          };
        }>;
      };
    };
  })?.output?.message?.content;

  if (!content) return undefined;

  const sources: string[] = [];

  for (const block of content) {
    const citations = block.citationsContent?.citations;
    if (citations) {
      for (const citation of citations) {
        const url = citation.location?.web?.url;
        if (url) {
          sources.push(url);
        }
      }
    }
  }

  return sources.length > 0 ? { sources: [...new Set(sources)] } : undefined;
}

/**
 * Amazon Bedrock LLM Provider
 */
export class BedrockProvider implements LLMProvider {
  readonly name: ProviderName = 'bedrock';
  private client: { send: (command: unknown) => Promise<unknown> } | null = null;
  private sdk: Awaited<ReturnType<typeof loadBedrockSDK>> | null = null;
  private defaultModel: string;
  private region: string;
  private profile?: string;
  private initPromise: Promise<void> | null = null;

  constructor(options: {
    region?: string;
    profile?: string;
    defaultModel?: string;
  } = {}) {
    this.region = options.region || process.env.AWS_REGION || DEFAULT_REGION;
    this.profile = options.profile || process.env.AWS_PROFILE;
    this.defaultModel = options.defaultModel || DEFAULT_BEDROCK_MODEL;
  }

  /**
   * Initialize the Bedrock client (lazy loading)
   */
  private async ensureInitialized(): Promise<void> {
    if (this.client) return;

    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }

    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    this.sdk = await loadBedrockSDK();

    const clientConfig: { region: string } = {
      region: this.region,
    };

    // Note: profile is handled by AWS SDK credential chain
    // Setting AWS_PROFILE env var or using ~/.aws/credentials
    if (this.profile) {
      // For explicit profile, user should set AWS_PROFILE env var
      // or use fromIni() credential provider
      process.env.AWS_PROFILE = this.profile;
    }

    this.client = new this.sdk.BedrockRuntimeClient(clientConfig);
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResponse> {
    await this.ensureInitialized();

    const model = options?.model || this.defaultModel;

    const messages: BedrockMessage[] = [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ];

    const commandInput: {
      modelId: string;
      messages: BedrockMessage[];
      inferenceConfig?: {
        maxTokens?: number;
        temperature?: number;
      };
      toolConfig?: {
        tools: Array<{ systemTool: { name: string } }>;
      };
    } = {
      modelId: model,
      messages,
      inferenceConfig: {
        maxTokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
      },
    };

    // Add web grounding tool for Nova Premier if enabled
    if (options?.enableWebGrounding) {
      commandInput.toolConfig = {
        tools: [
          {
            // Nova Premier web grounding system tool
            systemTool: { name: 'nova_grounding' },
          },
        ],
      };
    }

    const command = new this.sdk!.ConverseCommand(commandInput);
    const response = await this.client!.send(command) as {
      output?: {
        message?: {
          content?: Array<{ text?: string }>;
        };
      };
    };

    // Extract text from response
    const text = response.output?.message?.content
      ?.map((block) => block.text || '')
      .join('') || '';

    return {
      text,
      groundingMetadata: extractGroundingMetadata(response),
    };
  }

  async generateConversation(
    messages: Message[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    await this.ensureInitialized();

    const model = options?.model || this.defaultModel;
    const { system, messages: bedrockMessages } = messagesToBedrockFormat(messages);

    const commandInput: {
      modelId: string;
      messages: BedrockMessage[];
      system?: SystemContentBlock[];
      inferenceConfig?: {
        maxTokens?: number;
        temperature?: number;
      };
      toolConfig?: {
        tools: Array<{ systemTool: { name: string } }>;
      };
    } = {
      modelId: model,
      messages: bedrockMessages,
      inferenceConfig: {
        maxTokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
      },
    };

    // Add system messages if present
    if (system.length > 0) {
      commandInput.system = system;
    }

    // Add web grounding tool for Nova Premier if enabled
    if (options?.enableWebGrounding) {
      commandInput.toolConfig = {
        tools: [
          {
            systemTool: { name: 'nova_grounding' },
          },
        ],
      };
    }

    const command = new this.sdk!.ConverseCommand(commandInput);
    const response = await this.client!.send(command) as {
      output?: {
        message?: {
          content?: Array<{ text?: string }>;
        };
      };
    };

    // Extract text from response
    const text = response.output?.message?.content
      ?.map((block) => block.text || '')
      .join('') || '';

    return {
      text,
      groundingMetadata: extractGroundingMetadata(response),
    };
  }

  supportsWebGrounding(): boolean {
    // Nova Premier supports web grounding
    return true;
  }

  getGroundingModel(): string {
    return GROUNDING_MODEL;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.ensureInitialized();

      const command = new this.sdk!.ConverseCommand({
        modelId: this.defaultModel,
        messages: [
          {
            role: 'user',
            content: [{ text: 'Say "ok"' }],
          },
        ],
        inferenceConfig: {
          maxTokens: 10,
          temperature: 0.1,
        },
      });

      const response = await this.client!.send(command) as {
        output?: {
          message?: {
            content?: unknown[];
          };
        };
      };
      return !!response.output?.message?.content;
    } catch {
      return false;
    }
  }

  /**
   * Get the underlying Bedrock client for direct access
   */
  async getClient(): Promise<{ send: (command: unknown) => Promise<unknown> }> {
    await this.ensureInitialized();
    return this.client!;
  }
}
