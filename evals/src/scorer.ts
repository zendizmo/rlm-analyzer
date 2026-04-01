/**
 * Eval Scorer
 * Calculates metrics by comparing analysis output to ground truth
 */

import type {
  SecurityGroundTruth,
  SecurityMetrics,
  Vulnerability,
  OperationalMetrics,
} from './types.js';
import type { CodeAnalysisResult } from '../../src/types.js';

// ============================================================================
// Security Scoring
// ============================================================================

/**
 * Check if a vulnerability was detected in the output
 */
function isVulnerabilityDetected(
  vuln: Vulnerability,
  output: string
): { detected: boolean; confidence: 'high' | 'medium' | 'low' } {
  const lowerOutput = output.toLowerCase();

  // Check for exact file mention
  const fileDetected = lowerOutput.includes(vuln.file.toLowerCase());

  // Check for vulnerability type keywords
  const typeKeywords: Record<string, string[]> = {
    'sql-injection': ['sql injection', 'sqli', 'sql query', 'unsanitized', 'parameterized'],
    'xss': ['xss', 'cross-site scripting', 'script injection', 'sanitize', 'escape'],
    'auth-bypass': ['authentication bypass', 'auth bypass', 'authorization', 'access control'],
    'path-traversal': ['path traversal', 'directory traversal', '../', 'file access'],
    'command-injection': ['command injection', 'shell injection', 'exec', 'system call'],
    'ssrf': ['ssrf', 'server-side request', 'internal request'],
    'idor': ['idor', 'insecure direct object', 'authorization check'],
    'hardcoded-secret': ['hardcoded', 'secret', 'api key', 'password', 'credential'],
    'weak-crypto': ['weak crypto', 'md5', 'sha1', 'deprecated', 'insecure hash'],
    'missing-auth': ['missing authentication', 'unauthenticated', 'no auth'],
  };

  const typeMatches = typeKeywords[vuln.type] || [];
  const typeDetected = typeMatches.some(kw => lowerOutput.includes(kw));

  // Check for specific keywords from ground truth
  const keywordDetected = vuln.keywords.some(kw =>
    lowerOutput.includes(kw.toLowerCase())
  );

  // Check for CVE/CWE if specified
  const cveDetected = vuln.cve ? lowerOutput.includes(vuln.cve.toLowerCase()) : false;
  const cweDetected = vuln.cwe ? lowerOutput.includes(vuln.cwe.toLowerCase()) : false;

  // Calculate confidence
  let matchScore = 0;
  if (fileDetected) matchScore += 2;
  if (typeDetected) matchScore += 2;
  if (keywordDetected) matchScore += 1;
  if (cveDetected) matchScore += 2;
  if (cweDetected) matchScore += 1;

  // Determine if detected and confidence level
  if (matchScore >= 4) {
    return { detected: true, confidence: 'high' };
  } else if (matchScore >= 2) {
    return { detected: true, confidence: 'medium' };
  } else if (matchScore >= 1) {
    return { detected: true, confidence: 'low' };
  }

  return { detected: false, confidence: 'low' };
}

/**
 * Extract potential false positives from output
 * These are security issues mentioned that aren't in ground truth
 */
function extractPotentialFalsePositives(
  output: string,
  groundTruth: SecurityGroundTruth
): string[] {
  const falsePositives: string[] = [];
  const lowerOutput = output.toLowerCase();

  // Common security issue patterns to look for
  const securityPatterns = [
    { pattern: /sql injection[^.]*\./gi, type: 'sql-injection' },
    { pattern: /xss[^.]*\./gi, type: 'xss' },
    { pattern: /cross-site scripting[^.]*\./gi, type: 'xss' },
    { pattern: /authentication bypass[^.]*\./gi, type: 'auth-bypass' },
    { pattern: /hardcoded (secret|password|key|credential)[^.]*\./gi, type: 'hardcoded-secret' },
    { pattern: /command injection[^.]*\./gi, type: 'command-injection' },
    { pattern: /path traversal[^.]*\./gi, type: 'path-traversal' },
  ];

  for (const { pattern, type } of securityPatterns) {
    const matches = output.match(pattern) || [];
    for (const match of matches) {
      // Check if this matches any known vulnerability
      const isKnown = groundTruth.vulnerabilities.some(v =>
        v.type === type && isVulnerabilityDetected(v, match).detected
      );

      if (!isKnown) {
        falsePositives.push(match.trim());
      }
    }
  }

  return [...new Set(falsePositives)]; // Dedupe
}

/**
 * Score security analysis output against ground truth
 */
export function scoreSecurityAnalysis(
  output: CodeAnalysisResult,
  groundTruth: SecurityGroundTruth
): SecurityMetrics {
  const answer = output.answer || '';

  const found: string[] = [];
  const missed: string[] = [];

  // Check each vulnerability
  for (const vuln of groundTruth.vulnerabilities) {
    const { detected, confidence } = isVulnerabilityDetected(vuln, answer);

    if (detected && confidence !== 'low') {
      found.push(vuln.id);
    } else {
      missed.push(vuln.id);
    }
  }

  // Find potential false positives
  const extra = extractPotentialFalsePositives(answer, groundTruth);

  // Calculate metrics
  const truePositives = found.length;
  const falsePositives = extra.length;
  const falseNegatives = missed.length;

  const precision = truePositives + falsePositives === 0
    ? 0
    : truePositives / (truePositives + falsePositives);

  const recall = truePositives + falseNegatives === 0
    ? 0
    : truePositives / (truePositives + falseNegatives);

  const f1 = precision + recall === 0
    ? 0
    : 2 * (precision * recall) / (precision + recall);

  return {
    truePositives,
    falsePositives,
    falseNegatives,
    precision: Math.round(precision * 100) / 100,
    recall: Math.round(recall * 100) / 100,
    f1: Math.round(f1 * 100) / 100,
    findings: {
      found,
      missed,
      extra,
    },
  };
}

// ============================================================================
// Operational Scoring
// ============================================================================

/**
 * Calculate operational metrics from analysis result
 */
export function calculateOperationalMetrics(
  output: CodeAnalysisResult
): OperationalMetrics {
  // Estimate tokens (rough approximation: 4 chars = 1 token)
  const answerTokens = output.answer ? Math.ceil(output.answer.length / 4) : 0;
  const turnTokens = output.turns.reduce((sum, t) => {
    return sum + Math.ceil((t.response?.length || 0) / 4);
  }, 0);

  return {
    executionTimeMs: output.executionTimeMs,
    turnCount: output.turns.length,
    subLLMCount: output.subCallCount,
    tokenEstimate: answerTokens + turnTokens,
    success: output.success,
    error: output.error,
  };
}

// ============================================================================
// Summary Scoring (Simple keyword matching)
// ============================================================================

/**
 * Score summary output for topic coverage
 */
export function scoreSummaryTopics(
  output: string,
  expectedTopics: string[]
): { covered: string[]; missing: string[]; coverage: number } {
  const lowerOutput = output.toLowerCase();
  const covered: string[] = [];
  const missing: string[] = [];

  for (const topic of expectedTopics) {
    if (lowerOutput.includes(topic.toLowerCase())) {
      covered.push(topic);
    } else {
      missing.push(topic);
    }
  }

  const coverage = expectedTopics.length === 0
    ? 1
    : covered.length / expectedTopics.length;

  return {
    covered,
    missing,
    coverage: Math.round(coverage * 100) / 100,
  };
}

// ============================================================================
// File Coverage Scoring
// ============================================================================

/**
 * Calculate what percentage of expected files were analyzed
 */
export function scoreFileCoverage(
  analyzedFiles: string[],
  expectedFiles: string[]
): { covered: string[]; missing: string[]; coverage: number } {
  const covered: string[] = [];
  const missing: string[] = [];

  for (const expected of expectedFiles) {
    // Support glob-like patterns (e.g., "src/routes/*")
    if (expected.includes('*')) {
      const pattern = expected.replace('*', '');
      const matched = analyzedFiles.some(f => f.includes(pattern));
      if (matched) {
        covered.push(expected);
      } else {
        missing.push(expected);
      }
    } else {
      if (analyzedFiles.includes(expected)) {
        covered.push(expected);
      } else {
        missing.push(expected);
      }
    }
  }

  const coverage = expectedFiles.length === 0
    ? 1
    : covered.length / expectedFiles.length;

  return {
    covered,
    missing,
    coverage: Math.round(coverage * 100) / 100,
  };
}
