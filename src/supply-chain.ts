/**
 * Supply Chain Scanner
 * Scans project dependencies against OSV.dev API for CVEs and malicious packages
 * Supports npm (package.json), PyPI (requirements.txt), and Go (go.mod)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { SupplyChainResult, VulnerabilityFinding, SupplyChainOptions } from './types.js';

const OSV_API = 'https://api.osv.dev/v1/query';
const BATCH_CONCURRENCY = 10;

interface OsvVulnerability {
  id: string;
  summary?: string;
  severity?: Array<{ type: string; score: string }>;
  affected?: Array<{
    package?: { name: string; ecosystem: string };
    versions?: string[];
    ranges?: Array<{
      type: string;
      events?: Array<{ introduced?: string; fixed?: string }>;
    }>;
  }>;
}

interface OsvResponse {
  vulns?: OsvVulnerability[];
}

interface Dependency {
  name: string;
  version: string;
  ecosystem: string;
}

/**
 * Parse package.json dependencies
 */
function parsePackageJson(dir: string): Dependency[] {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return [];

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps: Dependency[] = [];
    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };

    for (const [name, version] of Object.entries(allDeps)) {
      // Strip semver range prefixes (^, ~, >=, etc.)
      const cleanVersion = String(version).replace(/^[^0-9]*/, '').split(' ')[0];
      if (cleanVersion && /^\d/.test(cleanVersion)) {
        deps.push({ name, version: cleanVersion, ecosystem: 'npm' });
      }
    }
    return deps;
  } catch {
    return [];
  }
}

/**
 * Parse requirements.txt dependencies
 */
function parseRequirementsTxt(dir: string): Dependency[] {
  const reqPath = path.join(dir, 'requirements.txt');
  if (!fs.existsSync(reqPath)) return [];

  const deps: Dependency[] = [];
  const lines = fs.readFileSync(reqPath, 'utf-8').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Handle pkg==version, pkg>=version, pkg~=version
    const match = trimmed.match(/^([A-Za-z0-9_.-]+)[>=~!<]+([0-9][A-Za-z0-9._-]*)/);
    if (match) {
      deps.push({ name: match[1], version: match[2], ecosystem: 'PyPI' });
    }
  }
  return deps;
}

/**
 * Parse go.mod dependencies
 */
function parseGoMod(dir: string): Dependency[] {
  const goModPath = path.join(dir, 'go.mod');
  if (!fs.existsSync(goModPath)) return [];

  const deps: Dependency[] = [];
  const lines = fs.readFileSync(goModPath, 'utf-8').split('\n');
  let inRequire = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'require (') {
      inRequire = true;
      continue;
    }
    if (trimmed === ')') {
      inRequire = false;
      continue;
    }

    const requireLine = inRequire || trimmed.startsWith('require ');
    if (requireLine) {
      const match = trimmed.replace(/^require\s+/, '').match(/^([^\s]+)\s+v([^\s]+)/);
      if (match) {
        deps.push({ name: match[1], version: match[2], ecosystem: 'Go' });
      }
    }
  }
  return deps;
}

/**
 * Query OSV.dev API for a single dependency
 */
async function queryOsv(dep: Dependency): Promise<VulnerabilityFinding[]> {
  const body = JSON.stringify({
    version: dep.version,
    package: {
      name: dep.name,
      ecosystem: dep.ecosystem,
    },
  });

  try {
    const response = await fetch(OSV_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) return [];

    const data = (await response.json()) as OsvResponse;
    if (!data.vulns) return [];

    return data.vulns.map((vuln) => {
      // Extract fixed version from ranges
      let fixedIn: string | undefined;
      for (const affected of vuln.affected || []) {
        for (const range of affected.ranges || []) {
          for (const event of range.events || []) {
            if (event.fixed) {
              fixedIn = event.fixed;
              break;
            }
          }
          if (fixedIn) break;
        }
        if (fixedIn) break;
      }

      // Determine severity
      const isMalicious = vuln.id.startsWith('MAL-');
      let severity: VulnerabilityFinding['severity'] = 'MEDIUM';

      if (isMalicious) {
        severity = 'CRITICAL';
      } else if (vuln.severity && vuln.severity.length > 0) {
        const score = parseFloat(vuln.severity[0].score);
        if (!isNaN(score)) {
          if (score >= 9.0) severity = 'CRITICAL';
          else if (score >= 7.0) severity = 'HIGH';
          else if (score >= 4.0) severity = 'MEDIUM';
          else severity = 'LOW';
        }
      }

      return {
        packageName: dep.name,
        version: dep.version,
        id: vuln.id,
        severity,
        isMalicious,
        summary: vuln.summary || 'No summary available',
        fixedIn,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Run npm audit and parse results as secondary signal
 */
function runNpmAudit(dir: string): Map<string, VulnerabilityFinding[]> {
  const results = new Map<string, VulnerabilityFinding[]>();

  try {
    const auditJson = execSync('npm audit --json 2>/dev/null', {
      cwd: dir,
      timeout: 30000,
      encoding: 'utf-8',
    });

    const audit = JSON.parse(auditJson);
    const vulnerabilities = audit.vulnerabilities || {};

    for (const [pkgName, vuln] of Object.entries(vulnerabilities as Record<string, {
      severity?: string;
      via?: Array<{ title?: string; url?: string; range?: string; fixAvailable?: boolean | { version?: string } }>;
      fixAvailable?: boolean | { version?: string };
    }>)) {
      const severity = mapNpmSeverity((vuln as { severity?: string }).severity);
      const via = (vuln as { via?: Array<{ title?: string; url?: string }> }).via || [];

      const findings: VulnerabilityFinding[] = via
        .filter((v) => typeof v === 'object' && v.title)
        .map((v) => ({
          packageName: pkgName,
          version: 'unknown',
          id: `npm-audit-${pkgName}`,
          severity,
          isMalicious: false,
          summary: v.title || 'npm audit finding',
          fixedIn: (() => {
            const fix = (vuln as { fixAvailable?: boolean | { version?: string } }).fixAvailable;
            if (fix && typeof fix === 'object' && fix.version) return fix.version;
            return undefined;
          })(),
        }));

      if (findings.length > 0) {
        results.set(pkgName, findings);
      }
    }
  } catch {
    // npm audit not available or failed — that's okay
  }

  return results;
}

function mapNpmSeverity(sev?: string): VulnerabilityFinding['severity'] {
  switch (sev?.toLowerCase()) {
    case 'critical': return 'CRITICAL';
    case 'high': return 'HIGH';
    case 'moderate': return 'MEDIUM';
    case 'low': return 'LOW';
    default: return 'MEDIUM';
  }
}

/**
 * Execute promises in batches with max concurrency
 */
async function batchExecute<T>(
  items: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Format the supply chain scan output
 */
function formatOutput(result: SupplyChainResult, showFix: boolean): string {
  const lines: string[] = [];

  lines.push(`\n🔍 Supply Chain Scan — ${result.projectName}\n`);

  const malicious = result.findings.filter((f) => f.isMalicious);
  const criticalCves = result.findings.filter((f) => !f.isMalicious && f.severity === 'CRITICAL');
  const highCves = result.findings.filter((f) => !f.isMalicious && f.severity === 'HIGH');
  const mediumCves = result.findings.filter((f) => !f.isMalicious && f.severity === 'MEDIUM');

  // Malicious
  lines.push(`🚨 MALICIOUS (${malicious.length})`);
  for (const f of malicious) {
    lines.push(`  ${f.packageName}@${f.version} — ${f.id}`);
    lines.push(`  ${f.summary}`);
    if (f.fixedIn) {
      lines.push(`  Safe version: ${f.fixedIn}`);
    } else {
      lines.push(`  Remove immediately — no safe version known.`);
    }
    if (showFix && f.fixedIn) {
      lines.push(`  Fix: npm install ${f.packageName}@${f.fixedIn}`);
    }
    lines.push('');
  }

  // Critical CVEs
  const critLabel = criticalCves.length === 0 ? '✅' : '⚠️ ';
  lines.push(`${critLabel} CRITICAL CVEs (${criticalCves.length})`);
  for (const f of criticalCves) {
    lines.push(`  ${f.packageName}@${f.version} — ${f.id}`);
    lines.push(`  ${f.summary}`);
    if (showFix && f.fixedIn) {
      lines.push(`  Fix: npm install ${f.packageName}@${f.fixedIn}`);
    }
  }
  if (criticalCves.length > 0) lines.push('');

  // High CVEs
  const highLabel = highCves.length === 0 ? '✅' : '⚠️ ';
  lines.push(`${highLabel} HIGH CVEs (${highCves.length})`);
  for (const f of highCves) {
    lines.push(`  ${f.packageName}@${f.version} — ${f.id}`);
    lines.push(`  ${f.summary}`);
    if (showFix && f.fixedIn) {
      lines.push(`  Fix: npm install ${f.packageName}@${f.fixedIn}`);
    }
  }
  if (highCves.length > 0) lines.push('');

  // Medium CVEs (compact)
  if (mediumCves.length > 0) {
    lines.push(`ℹ️  MEDIUM CVEs (${mediumCves.length})`);
    for (const f of mediumCves) {
      lines.push(`  ${f.packageName}@${f.version} — ${f.id}`);
    }
    lines.push('');
  }

  const atRisk = new Set(result.findings.map((f) => f.packageName)).size;
  const clean = result.scannedCount - atRisk;

  lines.push(`📦 Scanned: ${result.scannedCount} packages | Clean: ${clean} | At risk: ${atRisk}`);

  if (!showFix && result.findings.length > 0) {
    lines.push(`Run with --fix to see remediation commands.`);
  }

  return lines.join('\n');
}

/**
 * Main supply chain scan function
 */
export async function runSupplyChainScan(
  dir: string,
  options: SupplyChainOptions = {}
): Promise<SupplyChainResult> {
  const ecosystem = options.ecosystem || 'npm';

  // Get project name
  let projectName = path.basename(dir);
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
    if (pkg.name) projectName = pkg.name;
  } catch { /* ignore */ }

  // Parse dependencies based on ecosystem
  let deps: Dependency[] = [];
  if (ecosystem === 'npm' || !options.ecosystem) {
    deps = parsePackageJson(dir);
  }
  if (ecosystem === 'pypi' || !options.ecosystem) {
    deps.push(...parseRequirementsTxt(dir));
  }
  if (ecosystem === 'go' || !options.ecosystem) {
    deps.push(...parseGoMod(dir));
  }

  // Deduplicate
  const seen = new Set<string>();
  deps = deps.filter((d) => {
    const key = `${d.ecosystem}:${d.name}@${d.version}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const scannedCount = deps.length;

  // Query OSV in batches
  const queries = deps.map((dep) => () => queryOsv(dep));
  const batchResults = await batchExecute(queries, BATCH_CONCURRENCY);
  let findings: VulnerabilityFinding[] = batchResults.flat();

  // Merge npm audit results
  if (ecosystem === 'npm' || !options.ecosystem) {
    const npmAudit = runNpmAudit(dir);
    for (const [_pkgName, auditFindings] of npmAudit) {
      for (const af of auditFindings) {
        // Only add if not already found by OSV
        const alreadyFound = findings.some(
          (f) => f.packageName === af.packageName && f.id === af.id
        );
        if (!alreadyFound) {
          findings.push(af);
        }
      }
    }
  }

  // Sort: malicious first, then by severity
  const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  findings.sort((a, b) => {
    if (a.isMalicious !== b.isMalicious) return a.isMalicious ? -1 : 1;
    return (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4);
  });

  const result: SupplyChainResult = {
    projectName,
    scannedCount,
    findings,
    ecosystems: [...new Set(deps.map((d) => d.ecosystem))],
  };

  // Print formatted output
  console.log(formatOutput(result, options.fix || false));

  return result;
}
