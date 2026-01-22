#!/usr/bin/env node
/**
 * RLM Analyzer CLI
 * Command-line interface for code analysis
 * Supports multiple providers: Gemini (default) and Amazon Bedrock
 *
 * Usage:
 *   rlm <command> [options]
 *
 * Commands:
 *   summary     Get a codebase summary
 *   arch        Analyze architecture
 *   deps        Analyze dependencies
 *   security    Security analysis
 *   perf        Performance analysis
 *   refactor    Find refactoring opportunities
 *   find        Find symbol usages
 *   explain     Explain a file
 *   ask         Ask a custom question
 *   config      Configure API key
 *
 * Options:
 *   --dir, -d      Directory to analyze (default: current)
 *   --provider, -p Provider to use (gemini|bedrock)
 *   --verbose, -v  Show detailed output
 *   --json         Output as JSON
 *   --help, -h     Show help
 */

import * as path from 'path';
import {
  analyzeArchitecture,
  analyzeDependencies,
  analyzeSecurity,
  analyzePerformance,
  analyzeRefactoring,
  summarizeCodebase,
  findUsages,
  explainFile,
  askQuestion,
} from './analyzer.js';
import {
  hasApiKey,
  hasBedrockCredentials,
  initConfig,
  getApiKey,
  initializeProvider,
  detectProvider,
} from './config.js';
import type { ProviderName } from './providers/types.js';
import {
  getDefaultModel,
  resolveModelConfig,
  resolveProviderModelAlias,
  AVAILABLE_MODELS,
  AVAILABLE_BEDROCK_MODELS,
  getAliasesDisplay,
} from './models.js';
import type { RLMTurn, RLMProgress } from './types.js';
import * as fs from 'fs';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Progress spinner frames
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Phase display names
const phaseNames: Record<RLMProgress['phase'], string> = {
  'initializing': 'Initializing',
  'analyzing': 'Analyzing',
  'executing': 'Executing code',
  'sub-llm': 'Sub-LLM query',
  'finalizing': 'Finalizing',
};

/**
 * Progress tracker for real-time CLI feedback
 */
class ProgressTracker {
  private turnCount = 0;
  private subLLMCount = 0;
  private spinnerIndex = 0;
  private spinnerInterval: ReturnType<typeof setInterval> | null = null;
  private startTime = Date.now();
  private currentPhase: RLMProgress['phase'] = 'initializing';

  constructor() {}

  start(): void {
    this.startTime = Date.now();
    this.spinnerInterval = setInterval(() => {
      this.render();
      this.spinnerIndex = (this.spinnerIndex + 1) % spinnerFrames.length;
    }, 100);
    this.render();
  }

  stop(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
    // Clear the progress line
    process.stdout.write('\r\x1b[K');
  }

  private render(): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const spinner = spinnerFrames[this.spinnerIndex];
    const phaseName = phaseNames[this.currentPhase];
    const status = `${colors.cyan}${spinner}${colors.reset} ${colors.bold}${phaseName}${colors.reset} | Turn: ${colors.yellow}${this.turnCount}${colors.reset} | Sub-LLM: ${colors.green}${this.subLLMCount}${colors.reset} | Time: ${colors.dim}${elapsed}s${colors.reset}`;

    // Overwrite current line
    process.stdout.write(`\r\x1b[K${status}`);
  }

  /**
   * Update from RLMProgress callback - this is the primary update method
   */
  update(progress: RLMProgress): void {
    this.turnCount = progress.turn;
    this.subLLMCount = progress.subCallCount;
    this.currentPhase = progress.phase;
  }
}

function log(message: string, color?: keyof typeof colors): void {
  if (color) {
    console.log(`${colors[color]}${message}${colors.reset}`);
  } else {
    console.log(message);
  }
}

function printBanner(): void {
  log('\n╔══════════════════════════════════════════╗', 'cyan');
  log('║       RLM Analyzer - AI Code Analysis     ║', 'cyan');
  log('║   Powered by Recursive Language Models    ║', 'cyan');
  log('╚══════════════════════════════════════════╝\n', 'cyan');
}

function printHelp(provider?: ProviderName): void {
  printBanner();

  // Detect provider if not specified
  const currentProvider = provider || detectProvider();

  // Resolve current model config dynamically
  const modelConfig = resolveModelConfig({ provider: currentProvider });
  const defaultModel = modelConfig.defaultModel;

  // Format available models based on provider
  const availableModels = currentProvider === 'bedrock' ? AVAILABLE_BEDROCK_MODELS : AVAILABLE_MODELS;
  const modelsDisplay = availableModels.map(m => {
    const isDefault = m.id === defaultModel;
    const marker = isDefault ? ' (current default)' : '';
    return `  ${m.id.padEnd(40)} ${m.description}${marker}`;
  }).join('\n');

  // Format model aliases for current provider
  const aliasesDisplay = getAliasesDisplay(currentProvider);

  console.log(`${colors.bold}Usage:${colors.reset}
  rlm <command> [options]

${colors.bold}Commands:${colors.reset}
  ${colors.green}summary${colors.reset}              Get a codebase summary
  ${colors.green}arch${colors.reset}                 Analyze architecture and structure
  ${colors.green}deps${colors.reset}                 Analyze dependencies
  ${colors.green}security${colors.reset}             Security vulnerability analysis
  ${colors.green}perf${colors.reset}                 Performance analysis
  ${colors.green}refactor${colors.reset}             Find refactoring opportunities
  ${colors.green}find${colors.reset} <symbol>        Find all usages of a symbol
  ${colors.green}explain${colors.reset} <file>       Explain a specific file
  ${colors.green}ask${colors.reset} "<question>"     Ask a custom question
  ${colors.green}config${colors.reset} [api-key]     Configure or show API key status
  ${colors.green}test${colors.reset}                 Test API connection and model availability

${colors.bold}Options:${colors.reset}
  --dir, -d <path>      Directory to analyze (default: current directory)
  --provider, -p <name> LLM provider to use: gemini (default) or bedrock
  --model, -m <name>    Model to use (default: ${defaultModel})
                        Can use aliases: fast, smart, pro, flash (gemini)
                        Or: nova-lite, nova-pro, nova-premier (bedrock)
  --output, -o <file>   Save results to markdown file (e.g., rlm-context.md)
  --grounding, -g       Enable web grounding to verify package versions (security only)
  --verbose, -v         Show detailed turn-by-turn output
  --json                Output results as JSON
  --help, -h            Show this help message
  --version, -V         Show version number

${colors.bold}Available Models (${currentProvider}):${colors.reset}
${modelsDisplay}

${colors.bold}Model Aliases (${currentProvider}):${colors.reset}
${aliasesDisplay}

${colors.bold}Current Configuration:${colors.reset}
  Provider: ${currentProvider}
  Default: ${modelConfig.defaultModel} (from ${modelConfig.defaultSource})
  Fallback: ${modelConfig.fallbackModel} (from ${modelConfig.fallbackSource})

${colors.bold}Examples:${colors.reset}
  ${colors.dim}# Summarize current directory (uses default provider)${colors.reset}
  rlm summary

  ${colors.dim}# Analyze with Bedrock provider${colors.reset}
  rlm summary --provider bedrock

  ${colors.dim}# Analyze with specific model${colors.reset}
  rlm arch --model smart --dir /path/to/project

  ${colors.dim}# Use Bedrock with Nova Premier${colors.reset}
  rlm summary --provider bedrock --model nova-premier

  ${colors.dim}# Security analysis with web grounding (verifies package versions)${colors.reset}
  rlm security --grounding

  ${colors.dim}# Configure Gemini API key${colors.reset}
  rlm config YOUR_GEMINI_API_KEY

  ${colors.dim}# Set provider via environment${colors.reset}
  export RLM_PROVIDER=bedrock
  rlm summary

${colors.bold}Configuration:${colors.reset}

  ${colors.cyan}Gemini (Google):${colors.reset}
    1. Run: ${colors.cyan}rlm config YOUR_API_KEY${colors.reset}
    2. Or set: ${colors.cyan}export GEMINI_API_KEY=your_key${colors.reset}
    3. Get key at: ${colors.blue}https://aistudio.google.com/apikey${colors.reset}

  ${colors.cyan}Bedrock (AWS):${colors.reset}
    1. Configure AWS credentials:
       ${colors.cyan}export AWS_ACCESS_KEY_ID=your_key${colors.reset}
       ${colors.cyan}export AWS_SECRET_ACCESS_KEY=your_secret${colors.reset}
       ${colors.cyan}export AWS_REGION=us-east-1${colors.reset}
    2. Or use AWS profile: ${colors.cyan}export AWS_PROFILE=your_profile${colors.reset}
    3. Then: ${colors.cyan}rlm summary --provider bedrock${colors.reset}

${colors.bold}Environment Variables:${colors.reset}
  RLM_PROVIDER         Default provider (gemini|bedrock)
  RLM_DEFAULT_MODEL    Default model alias or ID
  GEMINI_API_KEY       Gemini API key
  AWS_ACCESS_KEY_ID    AWS access key (for Bedrock)
  AWS_SECRET_ACCESS_KEY AWS secret key (for Bedrock)
  AWS_REGION           AWS region (default: us-east-1)
  AWS_PROFILE          AWS credentials profile name

${colors.bold}Config File:${colors.reset}
  ~/.rlm-analyzer/config.json:
  ${colors.dim}{
    "apiKey": "gemini_api_key",
    "provider": "gemini",
    "models": {
      "default": "gemini-3-flash-preview",
      "fallback": "gemini-2.0-flash-exp"
    }
  }${colors.reset}
`);
}

function parseArgs(args: string[]): {
  command: string;
  target?: string;
  options: {
    dir: string;
    model: string;
    provider: ProviderName | undefined;
    verbose: boolean;
    json: boolean;
    help: boolean;
    version: boolean;
    output: string | null;
    grounding: boolean;
  };
} {
  const options = {
    dir: process.cwd(),
    model: '',  // Will be resolved later based on provider
    provider: undefined as ProviderName | undefined,
    verbose: false,
    json: false,
    help: false,
    version: false,
    output: null as string | null,
    grounding: false,
  };

  let command = '';
  let target: string | undefined;
  let i = 0;
  let modelFromCLI: string | undefined;

  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--version' || arg === '-V') {
      options.version = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--dir' || arg === '-d') {
      i++;
      options.dir = path.resolve(args[i] || '.');
    } else if (arg.startsWith('--dir=')) {
      options.dir = path.resolve(arg.slice(6));
    } else if (arg.startsWith('-d=')) {
      options.dir = path.resolve(arg.slice(3));
    } else if (arg === '--provider' || arg === '-p') {
      i++;
      const p = args[i]?.toLowerCase();
      if (p === 'gemini' || p === 'bedrock') {
        options.provider = p;
      }
    } else if (arg.startsWith('--provider=')) {
      const p = arg.slice(11).toLowerCase();
      if (p === 'gemini' || p === 'bedrock') {
        options.provider = p as ProviderName;
      }
    } else if (arg.startsWith('-p=')) {
      const p = arg.slice(3).toLowerCase();
      if (p === 'gemini' || p === 'bedrock') {
        options.provider = p as ProviderName;
      }
    } else if (arg === '--model' || arg === '-m') {
      i++;
      modelFromCLI = args[i];
    } else if (arg.startsWith('--model=')) {
      modelFromCLI = arg.slice(8);
    } else if (arg.startsWith('-m=')) {
      modelFromCLI = arg.slice(3);
    } else if (arg === '--output' || arg === '-o') {
      i++;
      options.output = args[i] || 'rlm-context.md';
    } else if (arg.startsWith('--output=')) {
      options.output = arg.slice(9);
    } else if (arg.startsWith('-o=')) {
      options.output = arg.slice(3);
    } else if (arg === '--grounding' || arg === '-g') {
      options.grounding = true;
    } else if (!command) {
      command = arg;
    } else if (!target) {
      target = arg;
    }

    i++;
  }

  // Determine provider (CLI flag or auto-detect)
  const provider = options.provider || detectProvider();

  // Resolve model alias if provided via CLI, using provider-specific aliases
  if (modelFromCLI) {
    options.model = resolveProviderModelAlias(modelFromCLI, provider);
  } else {
    // Get default model for the provider
    options.model = getDefaultModel({ provider });
  }

  return { command, target, options };
}

function createTurnCallback(verbose: boolean): ((turn: RLMTurn) => void) | undefined {
  if (!verbose) return undefined;

  return (turn: RLMTurn) => {
    // Clear progress line first
    process.stdout.write('\r\x1b[K');
    log(`\n--- Turn ${turn.turn} (Sub-LLM: ${turn.subCallCount || 0}) ---`, 'dim');
    if (turn.code) {
      log('Executing code...', 'yellow');
    }
    if (turn.executionResult) {
      const preview = turn.executionResult.slice(0, 200);
      log(`Output: ${preview}${turn.executionResult.length > 200 ? '...' : ''}`, 'dim');
    }
    if (turn.error) {
      log(`Error: ${turn.error}`, 'red');
    }
  };
}

function createProgressCallback(progressTracker: ProgressTracker): (progress: RLMProgress) => void {
  return (progress: RLMProgress) => {
    progressTracker.update(progress);
  };
}

async function runCommand(
  command: string,
  target: string | undefined,
  options: { dir: string; model: string; provider: ProviderName | undefined; verbose: boolean; json: boolean; output: string | null; grounding: boolean }
): Promise<void> {
  const startTime = Date.now();

  // Initialize provider
  const provider = initializeProvider(options.provider);

  log(`\nAnalyzing: ${options.dir}`, 'dim');
  log(`Provider: ${provider.name}`, 'dim');
  log(`Model: ${options.model}`, 'dim');
  log(`Command: ${command}${target ? ` ${target}` : ''}`, 'dim');
  if (options.output) {
    log(`Output: ${options.output}`, 'dim');
  }
  log('', 'reset');

  // Create progress tracker (always show progress unless outputting JSON)
  const progressTracker = options.json ? undefined : new ProgressTracker();
  progressTracker?.start();

  const onTurnComplete = createTurnCallback(options.verbose);
  const onProgress = progressTracker ? createProgressCallback(progressTracker) : undefined;
  const analysisOpts = { verbose: options.verbose, onTurnComplete, onProgress, model: options.model };

  let result;

  switch (command) {
    case 'summary':
      result = await summarizeCodebase(options.dir, analysisOpts);
      break;

    case 'arch':
    case 'architecture':
      result = await analyzeArchitecture(options.dir, analysisOpts);
      break;

    case 'deps':
    case 'dependencies':
      result = await analyzeDependencies(options.dir, analysisOpts);
      break;

    case 'security':
      result = await analyzeSecurity(options.dir, {
        ...analysisOpts,
        enableWebGrounding: options.grounding,
      });
      break;

    case 'perf':
    case 'performance':
      result = await analyzePerformance(options.dir, analysisOpts);
      break;

    case 'refactor':
      result = await analyzeRefactoring(options.dir, analysisOpts);
      break;

    case 'find':
      if (!target) {
        log('Error: Please specify a symbol to find', 'red');
        log('Usage: rlm find <symbol-name>', 'dim');
        process.exit(1);
      }
      result = await findUsages(options.dir, target, analysisOpts);
      break;

    case 'explain':
      if (!target) {
        log('Error: Please specify a file to explain', 'red');
        log('Usage: rlm explain <file-path>', 'dim');
        process.exit(1);
      }
      const filePath = path.isAbsolute(target) ? target : path.join(options.dir, target);
      result = await explainFile(filePath, analysisOpts);
      break;

    case 'ask':
      if (!target) {
        log('Error: Please specify a question', 'red');
        log('Usage: rlm ask "your question"', 'dim');
        process.exit(1);
      }
      result = await askQuestion(options.dir, target, analysisOpts);
      break;

    default:
      log(`Unknown command: ${command}`, 'red');
      log('Run "rlm --help" for usage information', 'dim');
      process.exit(1);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Stop progress tracker
  progressTracker?.stop();

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Print results
  log('\n' + '═'.repeat(50), 'cyan');
  log('ANALYSIS RESULT', 'bold');
  log('═'.repeat(50), 'cyan');

  if (result.success && result.answer) {
    log('\n' + result.answer, 'reset');
  } else if (result.error) {
    log(`\nError: ${result.error}`, 'red');
  } else {
    log('\nAnalysis incomplete. No final answer generated.', 'yellow');
    if (result.turns.length > 0) {
      log('\nPartial output from turns:', 'dim');
      for (const turn of result.turns.slice(-3)) {
        if (turn.executionResult) {
          log(turn.executionResult.slice(0, 500), 'dim');
        }
      }
    }
  }

  log('\n' + '─'.repeat(50), 'dim');
  log(`Provider: ${provider.name}`, 'dim');
  log(`Files analyzed: ${result.filesAnalyzed.length}`, 'dim');
  log(`Turns: ${result.turns.length}`, 'dim');
  log(`Sub-LLM calls: ${result.subCallCount}`, 'dim');
  log(`Time: ${duration}s`, 'dim');

  // Save to markdown file if output option specified
  if (options.output) {
    const outputPath = path.isAbsolute(options.output) ? options.output : path.join(options.dir, options.output);
    const markdown = generateMarkdownReport(command, target, options.dir, result, duration, provider.name);
    try {
      fs.writeFileSync(outputPath, markdown, 'utf-8');
      log(`\n✓ Results saved to: ${outputPath}`, 'green');
    } catch (err) {
      log(`\n✗ Failed to save results: ${err instanceof Error ? err.message : String(err)}`, 'red');
    }
  }
}

/**
 * Generate a markdown report from analysis results
 */
function generateMarkdownReport(
  command: string,
  target: string | undefined,
  directory: string,
  result: { success: boolean; answer: string | null; filesAnalyzed: string[]; turns: RLMTurn[]; subCallCount: number; error?: string },
  duration: string,
  provider: string
): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const dirName = path.basename(directory);

  let md = `# RLM Analysis: ${dirName}\n\n`;
  md += `> Generated by [RLM Analyzer](https://github.com/zendizmo/rlm-analyzer) on ${timestamp}\n\n`;

  md += `## Analysis Details\n\n`;
  md += `| Property | Value |\n`;
  md += `|----------|-------|\n`;
  md += `| Command | \`${command}${target ? ` ${target}` : ''}\` |\n`;
  md += `| Provider | ${provider} |\n`;
  md += `| Directory | \`${directory}\` |\n`;
  md += `| Files Analyzed | ${result.filesAnalyzed.length} |\n`;
  md += `| Turns | ${result.turns.length} |\n`;
  md += `| Sub-LLM Calls | ${result.subCallCount} |\n`;
  md += `| Duration | ${duration}s |\n`;
  md += `| Status | ${result.success ? '✅ Success' : '❌ ' + (result.error || 'Incomplete')} |\n\n`;

  if (result.success && result.answer) {
    md += `## Analysis Result\n\n`;
    md += result.answer + '\n\n';
  } else if (result.error) {
    md += `## Error\n\n`;
    md += `\`\`\`\n${result.error}\n\`\`\`\n\n`;
  }

  // Add file list (collapsed for large codebases)
  if (result.filesAnalyzed.length > 0) {
    md += `## Files Analyzed\n\n`;
    if (result.filesAnalyzed.length > 20) {
      md += `<details>\n<summary>Show ${result.filesAnalyzed.length} files</summary>\n\n`;
    }
    md += `\`\`\`\n${result.filesAnalyzed.join('\n')}\n\`\`\`\n`;
    if (result.filesAnalyzed.length > 20) {
      md += `\n</details>\n`;
    }
    md += '\n';
  }

  md += `---\n*Analysis performed with RLM Analyzer v1.4.0 using ${provider} provider*\n`;

  return md;
}

/**
 * Test API connection for the configured provider
 */
async function testConnection(model: string, providerOverride?: ProviderName): Promise<void> {
  // Initialize provider
  const provider = initializeProvider(providerOverride);

  log(`\nTesting ${provider.name} API connection...`, 'cyan');
  log(`Model: ${model}`, 'dim');

  try {
    log('Sending test request...', 'dim');

    const success = await provider.testConnection();

    if (success) {
      log(`\n✓ ${provider.name} API connection successful!`, 'green');
    } else {
      log(`\n✗ ${provider.name} connection test failed`, 'yellow');
    }
  } catch (error: unknown) {
    log(`\n✗ API connection failed!`, 'red');

    if (error instanceof Error) {
      log(`Error: ${error.message}`, 'red');
    } else {
      log(`Error: ${String(error)}`, 'red');
    }

    log('\nTroubleshooting tips:', 'yellow');
    if (provider.name === 'gemini') {
      log('1. Verify your GEMINI_API_KEY is correct', 'dim');
      log('2. Try a different model: --model gemini-2.0-flash-exp', 'dim');
      log('3. Visit https://aistudio.google.com to verify API access', 'dim');
    } else if (provider.name === 'bedrock') {
      log('1. Verify your AWS credentials are configured', 'dim');
      log('2. Check that you have access to Bedrock in your region', 'dim');
      log('3. Try: AWS_PROFILE=your_profile rlm test --provider bedrock', 'dim');
      log('4. Ensure the model is enabled in your AWS account', 'dim');
    }
  }
}

export async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, target, options } = parseArgs(args);

  // Show version
  if (options.version) {
    console.log('rlm-analyzer v1.4.0');
    process.exit(0);
  }

  // Show help
  if (options.help || !command) {
    printHelp(options.provider);
    process.exit(0);
  }

  // Handle test command
  if (command === 'test') {
    const provider = options.provider || detectProvider();
    if (provider === 'gemini' && !hasApiKey()) {
      log('Error: Gemini API key not configured', 'red');
      log('Run: rlm config YOUR_API_KEY', 'cyan');
      process.exit(1);
    }
    if (provider === 'bedrock' && !hasBedrockCredentials()) {
      log('Error: AWS credentials not configured for Bedrock', 'red');
      log('Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or AWS_PROFILE', 'cyan');
      process.exit(1);
    }
    await testConnection(options.model, options.provider);
    process.exit(0);
  }

  // Handle config command
  if (command === 'config') {
    if (target) {
      initConfig(target, options.provider);
      log('Configuration saved successfully!', 'green');
    } else {
      const detectedProvider = detectProvider();
      log(`Current provider: ${detectedProvider}`, 'cyan');

      if (hasApiKey()) {
        log('Gemini API key: configured', 'green');
        try {
          const key = getApiKey();
          log(`  Key: ${key.slice(0, 8)}...${key.slice(-4)}`, 'dim');
        } catch {
          // Ignore
        }
      } else {
        log('Gemini API key: not configured', 'yellow');
      }

      if (hasBedrockCredentials()) {
        log('AWS credentials: configured', 'green');
        if (process.env.AWS_PROFILE) {
          log(`  Profile: ${process.env.AWS_PROFILE}`, 'dim');
        }
        if (process.env.AWS_REGION) {
          log(`  Region: ${process.env.AWS_REGION}`, 'dim');
        }
      } else {
        log('AWS credentials: not configured', 'yellow');
      }

      log('\nTo configure Gemini:', 'reset');
      log('  rlm config YOUR_GEMINI_API_KEY', 'cyan');
      log('\nTo configure Bedrock:', 'reset');
      log('  export AWS_ACCESS_KEY_ID=your_key', 'cyan');
      log('  export AWS_SECRET_ACCESS_KEY=your_secret', 'cyan');
    }
    process.exit(0);
  }

  // Check credentials for the selected provider
  const provider = options.provider || detectProvider();
  if (provider === 'gemini' && !hasApiKey()) {
    log('Error: Gemini API key not configured', 'red');
    log('\nTo configure, run:', 'reset');
    log('  rlm config YOUR_GEMINI_API_KEY', 'cyan');
    log('\nOr set environment variable:', 'reset');
    log('  export GEMINI_API_KEY=your_key', 'cyan');
    log('\nGet your API key at:', 'reset');
    log('  https://aistudio.google.com/apikey', 'blue');
    process.exit(1);
  }

  if (provider === 'bedrock' && !hasBedrockCredentials()) {
    log('Error: AWS credentials not configured for Bedrock', 'red');
    log('\nTo configure, set environment variables:', 'reset');
    log('  export AWS_ACCESS_KEY_ID=your_key', 'cyan');
    log('  export AWS_SECRET_ACCESS_KEY=your_secret', 'cyan');
    log('  export AWS_REGION=us-east-1', 'cyan');
    log('\nOr use an AWS profile:', 'reset');
    log('  export AWS_PROFILE=your_profile', 'cyan');
    process.exit(1);
  }

  printBanner();

  try {
    await runCommand(command, target, options);
  } catch (error) {
    log(`\nError: ${error instanceof Error ? error.message : String(error)}`, 'red');
    process.exit(1);
  }
}

// Run directly if this file is executed
const isDirectRun = process.argv[1]?.endsWith('cli.js') || process.argv[1]?.endsWith('cli.ts');
if (isDirectRun) {
  runCli();
}
