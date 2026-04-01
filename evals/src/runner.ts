/**
 * Eval Runner
 * Executes evaluation cases and collects results
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import type {
  EvalCase,
  EvalResult,
  EvalConfig,
  EvalRunSummary,
  Benchmark,
  SecurityGroundTruth,
} from './types.js';
import {
  scoreSecurityAnalysis,
  calculateOperationalMetrics,
  scoreFileCoverage,
} from './scorer.js';
import {
  analyzeCodebase,
  analyzeSecurity,
  summarizeCodebase,
  analyzeArchitecture,
  analyzeDependencies,
} from '../../src/analyzer.js';
import { initializeProvider } from '../../src/config.js';
import type { AnalysisType, CodeAnalysisResult } from '../../src/types.js';
import type { ProviderName } from '../../src/providers/types.js';

// Get version from package.json
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')
);
const VERSION = packageJson.version;

// ============================================================================
// Benchmark Loading
// ============================================================================

/**
 * Load benchmark metadata
 */
export function loadBenchmark(benchmarkId: string): Benchmark | null {
  const metaPath = path.join(__dirname, '../benchmarks', benchmarkId, 'benchmark.json');

  if (!fs.existsSync(metaPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
}

/**
 * Load all available benchmarks
 */
export function loadAllBenchmarks(): Benchmark[] {
  const benchmarksDir = path.join(__dirname, '../benchmarks');

  if (!fs.existsSync(benchmarksDir)) {
    return [];
  }

  const entries = fs.readdirSync(benchmarksDir, { withFileTypes: true });
  const benchmarks: Benchmark[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const benchmark = loadBenchmark(entry.name);
      if (benchmark) {
        benchmarks.push(benchmark);
      }
    }
  }

  return benchmarks;
}

/**
 * Load ground truth for a benchmark and analysis type
 */
export function loadGroundTruth(
  benchmarkId: string,
  analysisType: AnalysisType
): SecurityGroundTruth | null {
  const gtPath = path.join(
    __dirname,
    '../ground-truth',
    benchmarkId,
    `${analysisType}.json`
  );

  if (!fs.existsSync(gtPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(gtPath, 'utf-8'));
}

// ============================================================================
// Eval Execution
// ============================================================================

/**
 * Run analysis for a specific type
 */
async function runAnalysis(
  directory: string,
  analysisType: AnalysisType,
  provider: ProviderName,
  model: string,
  verbose: boolean
): Promise<CodeAnalysisResult> {
  const options = {
    directory,
    provider,
    model: model === 'default' ? undefined : model,
    verbose,
  };

  switch (analysisType) {
    case 'security':
      return analyzeSecurity(directory, options);
    case 'summary':
      return summarizeCodebase(directory, options);
    case 'architecture':
      return analyzeArchitecture(directory, options);
    case 'dependencies':
      return analyzeDependencies(directory, options);
    default:
      return analyzeCodebase({ ...options, analysisType });
  }
}

/**
 * Run a single eval case
 */
export async function runEvalCase(
  evalCase: EvalCase,
  provider: ProviderName,
  model: string,
  verbose: boolean
): Promise<EvalResult> {
  const startTime = Date.now();

  // Initialize provider
  initializeProvider(provider);

  // Get benchmark path
  const benchmarkPath = path.join(
    __dirname,
    '../benchmarks',
    evalCase.benchmark.path
  );

  if (verbose) {
    console.log(`\n[Eval] Running: ${evalCase.id}`);
    console.log(`  Benchmark: ${evalCase.benchmark.name}`);
    console.log(`  Type: ${evalCase.analysisType}`);
    console.log(`  Provider: ${provider}`);
  }

  // Run analysis
  let output: CodeAnalysisResult;
  try {
    output = await runAnalysis(
      benchmarkPath,
      evalCase.analysisType,
      provider,
      model,
      verbose
    );
  } catch (error) {
    // Return failed result
    output = {
      success: false,
      answer: null,
      turns: [],
      executionTimeMs: Date.now() - startTime,
      subCallCount: 0,
      filesAnalyzed: [],
      analysisType: evalCase.analysisType,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Calculate metrics
  const operational = calculateOperationalMetrics(output);

  // Calculate type-specific metrics
  let security;
  if (evalCase.analysisType === 'security' && output.success) {
    security = scoreSecurityAnalysis(
      output,
      evalCase.groundTruth as SecurityGroundTruth
    );
  }

  const result: EvalResult = {
    case: evalCase,
    output,
    operational,
    security,
    provider,
    model,
    timestamp: Date.now(),
    version: VERSION,
  };

  if (verbose) {
    console.log(`  Success: ${output.success}`);
    console.log(`  Time: ${operational.executionTimeMs}ms`);
    console.log(`  Turns: ${operational.turnCount}`);
    console.log(`  Sub-LLM: ${operational.subLLMCount}`);
    if (security) {
      console.log(`  F1: ${security.f1}`);
      console.log(`  Found: ${security.findings.found.length}/${evalCase.groundTruth && 'vulnerabilities' in evalCase.groundTruth ? evalCase.groundTruth.vulnerabilities.length : 0}`);
    }
  }

  return result;
}

/**
 * Run all eval cases matching config
 */
export async function runEvals(
  config: EvalConfig
): Promise<EvalRunSummary> {
  const runId = `eval-${Date.now()}`;
  const results: EvalResult[] = [];

  // Load benchmarks
  let benchmarks = loadAllBenchmarks();

  // Filter by config
  if (config.benchmarks.length > 0) {
    benchmarks = benchmarks.filter(b => config.benchmarks.includes(b.id));
  }

  if (benchmarks.length === 0) {
    console.log('[Eval] No benchmarks found');
    return {
      runId,
      timestamp: Date.now(),
      provider: config.providers[0],
      model: config.model,
      totalCases: 0,
      successfulCases: 0,
      averages: {
        executionTimeMs: 0,
        turnCount: 0,
        subLLMCount: 0,
      },
      results: [],
    };
  }

  // Build eval cases
  const evalCases: EvalCase[] = [];

  for (const benchmark of benchmarks) {
    const analysisTypes = config.analysisTypes.length > 0
      ? config.analysisTypes.filter(t => benchmark.supportedTypes.includes(t))
      : benchmark.supportedTypes;

    for (const analysisType of analysisTypes) {
      const groundTruth = loadGroundTruth(benchmark.id, analysisType);
      if (groundTruth) {
        evalCases.push({
          id: `${benchmark.id}-${analysisType}`,
          benchmark,
          analysisType,
          groundTruth,
        });
      }
    }
  }

  console.log(`[Eval] Running ${evalCases.length} cases across ${config.providers.length} provider(s)`);

  // Run each case for each provider
  for (const provider of config.providers) {
    for (const evalCase of evalCases) {
      try {
        const result = await runEvalCase(
          evalCase,
          provider,
          config.model,
          config.verbose
        );
        results.push(result);
      } catch (error) {
        console.error(`[Eval] Error running ${evalCase.id}:`, error);
      }
    }
  }

  // Calculate averages
  const successful = results.filter(r => r.output.success);
  const avgTime = successful.length > 0
    ? successful.reduce((s, r) => s + r.operational.executionTimeMs, 0) / successful.length
    : 0;
  const avgTurns = successful.length > 0
    ? successful.reduce((s, r) => s + r.operational.turnCount, 0) / successful.length
    : 0;
  const avgSubLLM = successful.length > 0
    ? successful.reduce((s, r) => s + r.operational.subLLMCount, 0) / successful.length
    : 0;

  const securityResults = results.filter(r => r.security);
  const avgF1 = securityResults.length > 0
    ? securityResults.reduce((s, r) => s + (r.security?.f1 || 0), 0) / securityResults.length
    : undefined;

  const summary: EvalRunSummary = {
    runId,
    timestamp: Date.now(),
    provider: config.providers[0],
    model: config.model,
    totalCases: results.length,
    successfulCases: successful.length,
    averages: {
      executionTimeMs: Math.round(avgTime),
      turnCount: Math.round(avgTurns * 10) / 10,
      subLLMCount: Math.round(avgSubLLM * 10) / 10,
      f1: avgF1 !== undefined ? Math.round(avgF1 * 100) / 100 : undefined,
    },
    results,
  };

  // Save results
  const outputPath = path.join(config.outputDir, `${runId}.json`);
  fs.mkdirSync(config.outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
  console.log(`\n[Eval] Results saved to: ${outputPath}`);

  return summary;
}

// ============================================================================
// Reporting
// ============================================================================

/**
 * Generate markdown report from eval summary
 */
export function generateReport(summary: EvalRunSummary): string {
  const lines: string[] = [];

  lines.push('# RLM Analyzer Evaluation Report');
  lines.push('');
  lines.push(`**Run ID:** ${summary.runId}`);
  lines.push(`**Date:** ${new Date(summary.timestamp).toISOString()}`);
  lines.push(`**Provider:** ${summary.provider}`);
  lines.push(`**Model:** ${summary.model}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Cases | ${summary.totalCases} |`);
  lines.push(`| Successful | ${summary.successfulCases} |`);
  lines.push(`| Avg Time | ${summary.averages.executionTimeMs}ms |`);
  lines.push(`| Avg Turns | ${summary.averages.turnCount} |`);
  lines.push(`| Avg Sub-LLM | ${summary.averages.subLLMCount} |`);
  if (summary.averages.f1 !== undefined) {
    lines.push(`| Avg F1 | ${summary.averages.f1} |`);
  }
  lines.push('');

  // Security results table
  const securityResults = summary.results.filter(r => r.security);
  if (securityResults.length > 0) {
    lines.push('## Security Evaluation Results');
    lines.push('');
    lines.push('| Benchmark | Precision | Recall | F1 | Found | Missed |');
    lines.push('|-----------|-----------|--------|----|----|-------|');

    for (const result of securityResults) {
      const s = result.security!;
      const gt = result.case.groundTruth as SecurityGroundTruth;
      lines.push(
        `| ${result.case.benchmark.name} | ${s.precision} | ${s.recall} | ${s.f1} | ${s.findings.found.length}/${gt.vulnerabilities.length} | ${s.findings.missed.join(', ') || '-'} |`
      );
    }
    lines.push('');
  }

  // Detailed findings
  lines.push('## Detailed Results');
  lines.push('');

  for (const result of summary.results) {
    lines.push(`### ${result.case.id}`);
    lines.push('');
    lines.push(`- **Success:** ${result.output.success ? '✅' : '❌'}`);
    lines.push(`- **Time:** ${result.operational.executionTimeMs}ms`);
    lines.push(`- **Turns:** ${result.operational.turnCount}`);
    lines.push(`- **Sub-LLM Calls:** ${result.operational.subLLMCount}`);

    if (result.security) {
      lines.push(`- **F1 Score:** ${result.security.f1}`);
      lines.push(`- **Found:** ${result.security.findings.found.join(', ') || 'None'}`);
      lines.push(`- **Missed:** ${result.security.findings.missed.join(', ') || 'None'}`);
      if (result.security.findings.extra.length > 0) {
        lines.push(`- **False Positives:** ${result.security.findings.extra.length}`);
      }
    }

    if (result.output.error) {
      lines.push(`- **Error:** ${result.output.error}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
