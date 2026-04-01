/**
 * RLM Analyzer Evaluation Types
 * Defines interfaces for benchmarks, ground truth, and eval results
 */

import type { AnalysisType, CodeAnalysisResult } from '../../src/types.js';
import type { ProviderName } from '../../src/providers/types.js';

// ============================================================================
// Ground Truth Types
// ============================================================================

/** Severity levels for vulnerabilities */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** A known vulnerability in ground truth */
export interface Vulnerability {
  /** Unique identifier */
  id: string;
  /** Vulnerability type (e.g., 'sql-injection', 'xss', 'auth-bypass') */
  type: string;
  /** File path where vulnerability exists */
  file: string;
  /** Line number (optional, for precise matching) */
  line?: number;
  /** Severity level */
  severity: Severity;
  /** Human-readable description */
  description: string;
  /** Keywords that should appear in detection */
  keywords: string[];
  /** CWE ID if applicable */
  cwe?: string;
  /** CVE ID if applicable */
  cve?: string;
}

/** Ground truth for security analysis */
export interface SecurityGroundTruth {
  /** Benchmark identifier */
  benchmark: string;
  /** List of known vulnerabilities */
  vulnerabilities: Vulnerability[];
  /** Files that should be analyzed */
  expectedFiles: string[];
  /** Minimum expected findings */
  minExpectedFindings: number;
}

/** Ground truth for architecture analysis */
export interface ArchitectureGroundTruth {
  benchmark: string;
  /** Expected patterns (e.g., 'MVC', 'microservices', 'monolith') */
  expectedPatterns: string[];
  /** Expected layers (e.g., 'api', 'service', 'repository') */
  expectedLayers: string[];
  /** Key files that define architecture */
  keyFiles: string[];
}

/** Ground truth for summary analysis */
export interface SummaryGroundTruth {
  benchmark: string;
  /** Topics that should be mentioned */
  expectedTopics: string[];
  /** Tech stack that should be identified */
  expectedTechStack: string[];
  /** Golden reference summary */
  goldenSummary: string;
}

/** Ground truth for dependency analysis */
export interface DependencyGroundTruth {
  benchmark: string;
  /** Key dependencies that must be identified */
  keyDependencies: string[];
  /** Known problematic dependencies */
  problematicDeps: {
    name: string;
    issue: string;
  }[];
}

/** Union type for all ground truth types */
export type GroundTruth =
  | SecurityGroundTruth
  | ArchitectureGroundTruth
  | SummaryGroundTruth
  | DependencyGroundTruth;

// ============================================================================
// Benchmark Types
// ============================================================================

/** Benchmark metadata */
export interface Benchmark {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Path to benchmark codebase (relative to benchmarks/) */
  path: string;
  /** Supported analysis types */
  supportedTypes: AnalysisType[];
  /** File count (for reference) */
  fileCount: number;
  /** Source (e.g., 'owasp', 'synthetic', 'real-world') */
  source: string;
  /** Tags for filtering */
  tags: string[];
}

// ============================================================================
// Eval Case Types
// ============================================================================

/** A single evaluation case */
export interface EvalCase {
  /** Unique identifier */
  id: string;
  /** Benchmark to run against */
  benchmark: Benchmark;
  /** Analysis type to run */
  analysisType: AnalysisType;
  /** Ground truth for this case */
  groundTruth: GroundTruth;
  /** Custom query (for 'ask' type) */
  query?: string;
}

// ============================================================================
// Eval Result Types
// ============================================================================

/** Metrics for security evaluation */
export interface SecurityMetrics {
  /** Vulnerabilities correctly identified */
  truePositives: number;
  /** Non-vulnerabilities incorrectly flagged */
  falsePositives: number;
  /** Vulnerabilities missed */
  falseNegatives: number;
  /** Precision = TP / (TP + FP) */
  precision: number;
  /** Recall = TP / (TP + FN) */
  recall: number;
  /** F1 = 2 * (P * R) / (P + R) */
  f1: number;
  /** Detailed findings */
  findings: {
    found: string[];      // IDs of found vulnerabilities
    missed: string[];     // IDs of missed vulnerabilities
    extra: string[];      // Descriptions of false positives
  };
}

/** Metrics for quality evaluation (LLM-as-judge) */
export interface QualityMetrics {
  /** Overall quality score (1-5) */
  overallScore: number;
  /** Completeness score (1-5) */
  completeness: number;
  /** Accuracy score (1-5) */
  accuracy: number;
  /** Clarity score (1-5) */
  clarity: number;
  /** Actionability score (1-5) */
  actionability: number;
  /** Judge's reasoning */
  reasoning: string;
  /** Suggested improvements */
  improvements: string[];
}

/** Operational metrics */
export interface OperationalMetrics {
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Number of conversation turns */
  turnCount: number;
  /** Number of sub-LLM calls */
  subLLMCount: number;
  /** Estimated token usage */
  tokenEstimate: number;
  /** Whether analysis completed successfully */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/** Complete eval result */
export interface EvalResult {
  /** The eval case that was run */
  case: EvalCase;
  /** Raw output from analyzer */
  output: CodeAnalysisResult;
  /** Operational metrics */
  operational: OperationalMetrics;
  /** Security metrics (if security eval) */
  security?: SecurityMetrics;
  /** Quality metrics (from LLM judge) */
  quality?: QualityMetrics;
  /** Provider used */
  provider: ProviderName;
  /** Model used */
  model: string;
  /** Timestamp */
  timestamp: number;
  /** RLM Analyzer version */
  version: string;
}

// ============================================================================
// Report Types
// ============================================================================

/** Summary of eval run */
export interface EvalRunSummary {
  /** Run identifier */
  runId: string;
  /** Timestamp */
  timestamp: number;
  /** Provider used */
  provider: ProviderName;
  /** Model used */
  model: string;
  /** Number of cases run */
  totalCases: number;
  /** Number of successful cases */
  successfulCases: number;
  /** Average metrics */
  averages: {
    executionTimeMs: number;
    turnCount: number;
    subLLMCount: number;
    f1?: number;
    qualityScore?: number;
  };
  /** Individual results */
  results: EvalResult[];
}

/** Comparison between providers */
export interface ProviderComparison {
  /** Benchmark ID */
  benchmark: string;
  /** Analysis type */
  analysisType: AnalysisType;
  /** Results per provider */
  providers: {
    [key in ProviderName]?: {
      f1?: number;
      qualityScore?: number;
      executionTimeMs: number;
      success: boolean;
    };
  };
  /** Winner (best F1 or quality) */
  winner?: ProviderName;
}

// ============================================================================
// Config Types
// ============================================================================

/** Eval run configuration */
export interface EvalConfig {
  /** Benchmarks to run (empty = all) */
  benchmarks: string[];
  /** Analysis types to run (empty = all) */
  analysisTypes: AnalysisType[];
  /** Providers to test */
  providers: ProviderName[];
  /** Model to use (or 'default') */
  model: string;
  /** Enable LLM-as-judge quality scoring */
  enableQualityScoring: boolean;
  /** Verbose output */
  verbose: boolean;
  /** Output directory for results */
  outputDir: string;
}

export const DEFAULT_EVAL_CONFIG: EvalConfig = {
  benchmarks: [],
  analysisTypes: ['security'],
  providers: ['gemini'],
  model: 'default',
  enableQualityScoring: false,
  verbose: false,
  outputDir: './evals/results',
};
