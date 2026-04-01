# RLM Analyzer Evaluations

Evaluation framework for benchmarking RLM Analyzer's accuracy against codebases with known ground truth.

## Quick Start

```bash
# From project root
npm run eval:list           # List available benchmarks
npm run eval                # Run all evals
npm run eval:security       # Run security evals only
npm run eval:results        # View previous results
npm run eval:report <id>    # View detailed report
```

## Scripts

### NPM Scripts (from project root)

| Command | Description |
|---------|-------------|
| `npm run eval` | Run all evaluations |
| `npm run eval:list` | List available benchmarks |
| `npm run eval:security` | Run security evaluations |
| `npm run eval:compare` | Compare Gemini vs Bedrock |
| `npm run eval:results` | List previous eval runs |
| `npm run eval:report <id>` | Show detailed report |

### Shell Scripts (from evals/scripts/)

| Script | Description |
|--------|-------------|
| `quick-test.sh` | Fast sanity check on vulnerable-express |
| `run-all.sh` | Run all eval types across all benchmarks |
| `compare-providers.sh` | Side-by-side Gemini vs Bedrock comparison |
| `ci-eval.sh` | CI-friendly script with F1 threshold |
| `summary-report.sh` | Summary of recent eval runs |
| `add-benchmark.sh` | Add a new benchmark to the system |

## CLI Usage

```bash
# Basic usage
npx tsx evals/cli.ts run [options]
npx tsx evals/cli.ts list
npx tsx evals/cli.ts report <run-id>
npx tsx evals/cli.ts results

# Run options
-b, --benchmark <id>    Run specific benchmark
-t, --type <type>       Analysis type: security, summary, architecture
-p, --provider <name>   Provider: gemini, bedrock
-m, --model <model>     Model to use
-v, --verbose           Show detailed output
--compare               Compare all providers
```

## Examples

```bash
# Run security eval on all benchmarks
npx tsx evals/cli.ts run -t security

# Run specific benchmark with verbose output
npx tsx evals/cli.ts run -b vulnerable-express -t security -v

# Compare providers
npx tsx evals/cli.ts run -t security --compare

# Use specific provider
npx tsx evals/cli.ts run -p bedrock -t security

# CI check with F1 threshold
./evals/scripts/ci-eval.sh --threshold 0.8
```

## Adding a Benchmark

### Automated

```bash
./evals/scripts/add-benchmark.sh my-benchmark /path/to/source
```

### Manual

1. Create benchmark folder:
```
evals/benchmarks/my-benchmark/
├── benchmark.json
├── package.json
└── src/
    └── ... (source files)
```

2. Create `benchmark.json`:
```json
{
  "id": "my-benchmark",
  "name": "My Benchmark",
  "description": "Description here",
  "path": "my-benchmark",
  "supportedTypes": ["security", "summary", "architecture"],
  "fileCount": 10,
  "source": "real-world",
  "tags": ["nodejs", "express"]
}
```

3. Create ground truth at `evals/ground-truth/my-benchmark/security.json`:
```json
{
  "benchmark": "my-benchmark",
  "vulnerabilities": [
    {
      "id": "VULN_001",
      "type": "sql-injection",
      "file": "src/routes/users.js",
      "line": 15,
      "severity": "critical",
      "description": "SQL injection in user search",
      "keywords": ["sql injection", "query", "username"],
      "cwe": "CWE-89"
    }
  ],
  "expectedFiles": ["src/routes/users.js", "src/models/db.js"],
  "minExpectedFindings": 1
}
```

## Metrics

### Security Evaluation

- **Precision**: TP / (TP + FP) - How many findings are real
- **Recall**: TP / (TP + FN) - How many vulnerabilities found
- **F1 Score**: Harmonic mean of precision and recall

### Operational Metrics

- **Execution Time**: Total analysis time
- **Turn Count**: Number of orchestrator turns
- **Sub-LLM Calls**: Number of sub-analysis calls
- **Token Estimate**: Approximate token usage

## Vulnerability Types

Supported vulnerability types for ground truth:

| Type | Description |
|------|-------------|
| `sql-injection` | SQL injection vulnerabilities |
| `xss` | Cross-site scripting |
| `auth-bypass` | Authentication bypass |
| `path-traversal` | Directory traversal |
| `command-injection` | OS command injection |
| `ssrf` | Server-side request forgery |
| `idor` | Insecure direct object reference |
| `hardcoded-secret` | Hardcoded credentials/keys |
| `weak-crypto` | Weak cryptographic algorithms |
| `unsafe-deserialization` | Unsafe deserialization |
| `mass-assignment` | Mass assignment vulnerabilities |
| `vulnerable-dependency` | Known vulnerable dependencies |

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run RLM Analyzer Evals
  env:
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
  run: |
    ./evals/scripts/ci-eval.sh --threshold 0.7
```

### Exit Codes

- `0`: F1 score meets threshold
- `1`: F1 score below threshold or error

## Directory Structure

```
evals/
├── cli.ts                 # CLI entry point
├── package.json           # Evals package config
├── tsconfig.json          # TypeScript config
├── README.md              # This file
├── src/
│   ├── index.ts           # Exports
│   ├── types.ts           # Type definitions
│   ├── runner.ts          # Eval execution engine
│   └── scorer.ts          # Metrics calculation
├── benchmarks/
│   └── vulnerable-express/
│       ├── benchmark.json
│       └── src/
├── ground-truth/
│   └── vulnerable-express/
│       └── security.json
├── results/
│   └── eval-*.json
└── scripts/
    ├── quick-test.sh
    ├── run-all.sh
    ├── compare-providers.sh
    ├── ci-eval.sh
    ├── summary-report.sh
    └── add-benchmark.sh
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Gemini API key (for Gemini provider) |
| `AWS_PROFILE` | AWS profile (for Bedrock provider) |
| `AWS_ACCESS_KEY_ID` | AWS access key (alternative) |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key (alternative) |
| `AWS_REGION` | AWS region (default: us-east-1) |
