#!/usr/bin/env node
/**
 * RLM Analyzer CLI
 * Command-line interface for code analysis
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
import { hasApiKey, initConfig, getApiKey } from './config.js';
import {
  getDefaultModel,
  resolveModelAlias,
  resolveModelConfig,
  AVAILABLE_MODELS,
  getAliasesDisplay,
} from './models.js';
import type { RLMTurn } from './types.js';

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

function printHelp(): void {
  printBanner();

  // Resolve current model config dynamically
  const modelConfig = resolveModelConfig();
  const defaultModel = modelConfig.defaultModel;

  // Format available models
  const modelsDisplay = AVAILABLE_MODELS.map(m => {
    const isDefault = m.id === defaultModel;
    const marker = isDefault ? ' (current default)' : '';
    return `  ${m.id.padEnd(26)} ${m.description}${marker}`;
  }).join('\n');

  // Format model aliases
  const aliasesDisplay = getAliasesDisplay();

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
  --dir, -d <path>   Directory to analyze (default: current directory)
  --model, -m <name> Model to use (default: ${defaultModel})
                     Can use aliases: fast, smart, pro, flash
  --verbose, -v      Show detailed turn-by-turn output
  --json             Output results as JSON
  --help, -h         Show this help message

${colors.bold}Available Models:${colors.reset}
${modelsDisplay}

${colors.bold}Model Aliases:${colors.reset}
${aliasesDisplay}

${colors.bold}Model Configuration Priority:${colors.reset}
  1. CLI --model flag (highest)
  2. Environment: RLM_DEFAULT_MODEL, RLM_FALLBACK_MODEL
  3. Config file: ~/.rlm-analyzer/config.json
  4. Built-in defaults

${colors.bold}Current Configuration:${colors.reset}
  Default: ${modelConfig.defaultModel} (from ${modelConfig.defaultSource})
  Fallback: ${modelConfig.fallbackModel} (from ${modelConfig.fallbackSource})

${colors.bold}Examples:${colors.reset}
  ${colors.dim}# Summarize current directory${colors.reset}
  rlm summary

  ${colors.dim}# Analyze with specific model${colors.reset}
  rlm arch --model smart --dir /path/to/project

  ${colors.dim}# Use alias for model${colors.reset}
  rlm summary --model fast

  ${colors.dim}# Find all usages of a function${colors.reset}
  rlm find "handleSubmit"

  ${colors.dim}# Ask a custom question${colors.reset}
  rlm ask "How does authentication work in this codebase?"

  ${colors.dim}# Configure API key${colors.reset}
  rlm config YOUR_GEMINI_API_KEY

  ${colors.dim}# Set default model via environment${colors.reset}
  export RLM_DEFAULT_MODEL=fast
  rlm summary

${colors.bold}Configuration:${colors.reset}
  Set your Gemini API key using one of these methods:
  1. Run: ${colors.cyan}rlm config YOUR_API_KEY${colors.reset}
  2. Set environment variable: ${colors.cyan}export GEMINI_API_KEY=your_key${colors.reset}
  3. Create .env file with: ${colors.cyan}GEMINI_API_KEY=your_key${colors.reset}

  Model configuration in ~/.rlm-analyzer/config.json:
  ${colors.dim}{
    "apiKey": "your_key",
    "models": {
      "default": "gemini-3-flash-preview",
      "fallback": "gemini-2.0-flash-exp"
    }
  }${colors.reset}

  Get your API key at: ${colors.blue}https://makersuite.google.com/app/apikey${colors.reset}
`);
}

function parseArgs(args: string[]): {
  command: string;
  target?: string;
  options: {
    dir: string;
    model: string;
    verbose: boolean;
    json: boolean;
    help: boolean;
  };
} {
  // Get default model dynamically
  const defaultModel = getDefaultModel();

  const options = {
    dir: process.cwd(),
    model: defaultModel,
    verbose: false,
    json: false,
    help: false,
  };

  let command = '';
  let target: string | undefined;
  let i = 0;
  let modelFromCLI: string | undefined;

  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
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
    } else if (arg === '--model' || arg === '-m') {
      i++;
      modelFromCLI = args[i];
    } else if (arg.startsWith('--model=')) {
      modelFromCLI = arg.slice(8);
    } else if (arg.startsWith('-m=')) {
      modelFromCLI = arg.slice(3);
    } else if (!command) {
      command = arg;
    } else if (!target) {
      target = arg;
    }

    i++;
  }

  // Resolve model alias if provided via CLI
  if (modelFromCLI) {
    options.model = resolveModelAlias(modelFromCLI);
  }

  return { command, target, options };
}

function createTurnCallback(verbose: boolean): ((turn: RLMTurn) => void) | undefined {
  if (!verbose) return undefined;

  return (turn: RLMTurn) => {
    log(`\n--- Turn ${turn.turn} ---`, 'dim');
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

async function runCommand(
  command: string,
  target: string | undefined,
  options: { dir: string; model: string; verbose: boolean; json: boolean }
): Promise<void> {
  const startTime = Date.now();

  log(`\nAnalyzing: ${options.dir}`, 'dim');
  log(`Model: ${options.model}`, 'dim');
  log(`Command: ${command}${target ? ` ${target}` : ''}`, 'dim');
  log('', 'reset');

  const onTurnComplete = createTurnCallback(options.verbose);
  const analysisOpts = { verbose: options.verbose, onTurnComplete, model: options.model };

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
      result = await analyzeSecurity(options.dir, analysisOpts);
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
  log(`Files analyzed: ${result.filesAnalyzed.length}`, 'dim');
  log(`Turns: ${result.turns.length}`, 'dim');
  log(`Sub-LLM calls: ${result.subCallCount}`, 'dim');
  log(`Time: ${duration}s`, 'dim');
}

/**
 * Test Gemini API connection directly
 */
async function testConnection(model: string): Promise<void> {
  log('\nTesting Gemini API connection...', 'cyan');
  log(`Model: ${model}`, 'dim');

  try {
    const { getAIClient } = await import('./config.js');
    const ai = getAIClient();

    log('Sending test request...', 'dim');

    const response = await ai.models.generateContent({
      model,
      contents: 'Say "Hello, RLM Analyzer!" and nothing else.',
      config: {
        temperature: 0.1,
        maxOutputTokens: 50,
      },
    });

    if (response.text) {
      log(`\n✓ API connection successful!`, 'green');
      log(`Response: ${response.text}`, 'reset');
    } else {
      log(`\n✗ No response text received`, 'yellow');
      log(`Full response: ${JSON.stringify(response, null, 2)}`, 'dim');
    }
  } catch (error: unknown) {
    log(`\n✗ API connection failed!`, 'red');

    if (error instanceof Error) {
      log(`Error: ${error.message}`, 'red');

      // Try to extract more details from the error
      const errorObj = error as unknown as Record<string, unknown>;
      if (errorObj.cause) {
        log(`Cause: ${JSON.stringify(errorObj.cause)}`, 'dim');
      }
      if (errorObj.status) {
        log(`Status: ${errorObj.status}`, 'dim');
      }
      if (errorObj.statusText) {
        log(`Status Text: ${errorObj.statusText}`, 'dim');
      }
      if (errorObj.response) {
        log(`Response: ${JSON.stringify(errorObj.response)}`, 'dim');
      }
    } else {
      log(`Error: ${String(error)}`, 'red');
    }

    log('\nTroubleshooting tips:', 'yellow');
    log('1. Verify your API key is correct', 'dim');
    log('2. Try a different model: --model gemini-2.0-flash-exp', 'dim');
    log('3. Check if your API key has access to the model', 'dim');
    log('4. Visit https://aistudio.google.com to verify API access', 'dim');
  }
}

export async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, target, options } = parseArgs(args);

  // Show help
  if (options.help || !command) {
    printHelp();
    process.exit(0);
  }

  // Handle test command
  if (command === 'test') {
    if (!hasApiKey()) {
      log('Error: API key not configured', 'red');
      log('Run: rlm config YOUR_API_KEY', 'cyan');
      process.exit(1);
    }
    await testConnection(options.model);
    process.exit(0);
  }

  // Handle config command
  if (command === 'config') {
    if (target) {
      initConfig(target);
      log('API key saved successfully!', 'green');
    } else {
      if (hasApiKey()) {
        log('API key is configured', 'green');
        try {
          const key = getApiKey();
          log(`Key: ${key.slice(0, 8)}...${key.slice(-4)}`, 'dim');
        } catch {
          // Ignore
        }
      } else {
        log('API key not configured', 'yellow');
        log('\nTo configure, run:', 'reset');
        log('  rlm config YOUR_GEMINI_API_KEY', 'cyan');
        log('\nOr set environment variable:', 'reset');
        log('  export GEMINI_API_KEY=your_key', 'cyan');
      }
    }
    process.exit(0);
  }

  // Check API key
  if (!hasApiKey()) {
    log('Error: Gemini API key not configured', 'red');
    log('\nTo configure, run:', 'reset');
    log('  rlm config YOUR_GEMINI_API_KEY', 'cyan');
    log('\nOr set environment variable:', 'reset');
    log('  export GEMINI_API_KEY=your_key', 'cyan');
    log('\nGet your API key at:', 'reset');
    log('  https://makersuite.google.com/app/apikey', 'blue');
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
