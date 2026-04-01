#!/usr/bin/env npx ts-node
/**
 * RLM Analyzer Evaluation CLI
 * Run evaluations against benchmark codebases
 *
 * Usage:
 *   npx ts-node evals/cli.ts run [options]
 *   npx ts-node evals/cli.ts list
 *   npx ts-node evals/cli.ts report <run-id>
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  runEvals,
  loadAllBenchmarks,
  generateReport,
} from './src/runner.js';
import type { EvalConfig, EvalRunSummary } from './src/types.js';
import type { AnalysisType } from '../src/types.js';
import type { ProviderName } from '../src/providers/types.js';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg: string, color?: keyof typeof colors): void {
  if (color) {
    console.log(`${colors[color]}${msg}${colors.reset}`);
  } else {
    console.log(msg);
  }
}

function printBanner(): void {
  log('\n╔══════════════════════════════════════════╗', 'cyan');
  log('║       RLM Analyzer - Evaluations          ║', 'cyan');
  log('╚══════════════════════════════════════════╝\n', 'cyan');
}

function printHelp(): void {
  printBanner();
  log('Usage:', 'bold');
  log('  npx ts-node evals/cli.ts <command> [options]\n');

  log('Commands:', 'bold');
  log('  run                Run evaluations');
  log('  list               List available benchmarks');
  log('  report <run-id>    Generate report from previous run');
  log('  results            List previous eval runs\n');

  log('Run Options:', 'bold');
  log('  --benchmark, -b <id>    Run specific benchmark (can repeat)');
  log('  --type, -t <type>       Analysis type: security, summary, etc.');
  log('  --provider, -p <name>   Provider: gemini, bedrock, claude');
  log('  --model, -m <model>     Model to use (default: provider default)');
  log('  --verbose, -v           Show detailed output');
  log('  --compare               Compare all providers\n');

  log('Examples:', 'bold');
  log('  npx ts-node evals/cli.ts run', 'dim');
  log('  npx ts-node evals/cli.ts run -b juice-shop -t security', 'dim');
  log('  npx ts-node evals/cli.ts run --compare -t security', 'dim');
  log('  npx ts-node evals/cli.ts report eval-1705952000000\n', 'dim');
}

function parseArgs(args: string[]): {
  command: string;
  target?: string;
  config: Partial<EvalConfig>;
  compare: boolean;
} {
  const config: Partial<EvalConfig> = {
    benchmarks: [],
    analysisTypes: [],
    providers: [],
    verbose: false,
  };
  let command = 'help';
  let target: string | undefined;
  let compare = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (i === 0 && !arg.startsWith('-')) {
      command = arg;
      continue;
    }

    if (i === 1 && !arg.startsWith('-') && command !== 'run') {
      target = arg;
      continue;
    }

    switch (arg) {
      case '--benchmark':
      case '-b':
        config.benchmarks!.push(args[++i]);
        break;
      case '--type':
      case '-t':
        config.analysisTypes!.push(args[++i] as AnalysisType);
        break;
      case '--provider':
      case '-p':
        config.providers!.push(args[++i] as ProviderName);
        break;
      case '--model':
      case '-m':
        config.model = args[++i];
        break;
      case '--verbose':
      case '-v':
        config.verbose = true;
        break;
      case '--compare':
        compare = true;
        break;
      case '--help':
      case '-h':
        command = 'help';
        break;
    }
  }

  return { command, target, config, compare };
}

async function runCommand(
  config: Partial<EvalConfig>,
  compare: boolean
): Promise<void> {
  const fullConfig: EvalConfig = {
    benchmarks: config.benchmarks || [],
    analysisTypes: config.analysisTypes?.length ? config.analysisTypes : ['security'],
    providers: compare
      ? ['gemini', 'bedrock']
      : config.providers?.length ? config.providers : ['gemini'],
    model: config.model || 'default',
    enableQualityScoring: false,
    verbose: config.verbose || false,
    outputDir: path.join(__dirname, 'results'),
  };

  log('Running evaluations...', 'cyan');
  log(`  Providers: ${fullConfig.providers.join(', ')}`, 'dim');
  log(`  Types: ${fullConfig.analysisTypes.join(', ')}`, 'dim');
  if (fullConfig.benchmarks.length > 0) {
    log(`  Benchmarks: ${fullConfig.benchmarks.join(', ')}`, 'dim');
  }
  log('');

  const summary = await runEvals(fullConfig);

  // Print summary
  log('\n═══════════════════════════════════════════', 'cyan');
  log('                EVAL SUMMARY                ', 'bold');
  log('═══════════════════════════════════════════\n', 'cyan');

  log(`Total Cases: ${summary.totalCases}`);
  log(`Successful: ${summary.successfulCases}`, summary.successfulCases === summary.totalCases ? 'green' : 'yellow');
  log(`Avg Time: ${summary.averages.executionTimeMs}ms`);
  log(`Avg Turns: ${summary.averages.turnCount}`);
  log(`Avg Sub-LLM: ${summary.averages.subLLMCount}`);

  if (summary.averages.f1 !== undefined) {
    const f1Color = summary.averages.f1 >= 0.7 ? 'green' : summary.averages.f1 >= 0.5 ? 'yellow' : 'red';
    log(`Avg F1: ${summary.averages.f1}`, f1Color);
  }

  // Print per-case results
  if (summary.results.length > 0) {
    log('\nResults by Case:', 'bold');
    for (const result of summary.results) {
      const status = result.output.success ? '✅' : '❌';
      const f1 = result.security ? ` F1: ${result.security.f1}` : '';
      log(`  ${status} ${result.case.id} (${result.provider})${f1} - ${result.operational.executionTimeMs}ms`);
    }
  }

  log(`\nResults saved to: ${path.join(fullConfig.outputDir, `${summary.runId}.json`)}`, 'dim');
}

function listBenchmarks(): void {
  const benchmarks = loadAllBenchmarks();

  if (benchmarks.length === 0) {
    log('No benchmarks found.', 'yellow');
    log('\nTo add a benchmark:', 'dim');
    log('  1. Create a folder in evals/benchmarks/<name>/', 'dim');
    log('  2. Add benchmark.json with metadata', 'dim');
    log('  3. Add ground-truth/<name>/security.json', 'dim');
    return;
  }

  log('Available Benchmarks:', 'bold');
  log('');

  for (const b of benchmarks) {
    log(`  ${b.id}`, 'cyan');
    log(`    ${b.description}`, 'dim');
    log(`    Files: ${b.fileCount} | Types: ${b.supportedTypes.join(', ')}`);
    log('');
  }
}

function listResults(): void {
  const resultsDir = path.join(__dirname, 'results');

  if (!fs.existsSync(resultsDir)) {
    log('No eval results found.', 'yellow');
    return;
  }

  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    log('No eval results found.', 'yellow');
    return;
  }

  log('Previous Eval Runs:', 'bold');
  log('');

  for (const file of files.slice(-10)) {
    const data = JSON.parse(fs.readFileSync(path.join(resultsDir, file), 'utf-8')) as EvalRunSummary;
    const date = new Date(data.timestamp).toLocaleString();
    const f1 = data.averages.f1 !== undefined ? ` F1: ${data.averages.f1}` : '';
    log(`  ${data.runId}`, 'cyan');
    log(`    ${date} | ${data.provider} | ${data.successfulCases}/${data.totalCases} passed${f1}`, 'dim');
  }
}

function showReport(runId: string): void {
  const resultsDir = path.join(__dirname, 'results');
  const filePath = path.join(resultsDir, `${runId}.json`);

  if (!fs.existsSync(filePath)) {
    log(`Run not found: ${runId}`, 'red');
    return;
  }

  const summary = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as EvalRunSummary;
  const report = generateReport(summary);

  console.log(report);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, target, config, compare } = parseArgs(args);

  printBanner();

  switch (command) {
    case 'run':
      await runCommand(config, compare);
      break;
    case 'list':
      listBenchmarks();
      break;
    case 'results':
      listResults();
      break;
    case 'report':
      if (!target) {
        log('Usage: npx ts-node evals/cli.ts report <run-id>', 'red');
        break;
      }
      showReport(target);
      break;
    case 'help':
    default:
      printHelp();
  }
}

main().catch(console.error);
