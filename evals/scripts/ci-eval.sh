#!/bin/bash
# CI-friendly evaluation script
# Returns exit code 0 if F1 >= threshold, 1 otherwise
#
# Usage: ./evals/scripts/ci-eval.sh [options]
#
# Options:
#   -t, --threshold   Minimum F1 score (default: 0.7)
#   -b, --benchmark   Specific benchmark to run
#   -p, --provider    Provider to use (default: gemini)
#
# Environment:
#   GEMINI_API_KEY    Required for Gemini provider
#   AWS_PROFILE       Required for Bedrock provider
#
# Example:
#   ./evals/scripts/ci-eval.sh --threshold 0.8 --benchmark vulnerable-express

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Defaults
THRESHOLD=0.7
BENCHMARK=""
PROVIDER="gemini"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--threshold)
            THRESHOLD="$2"
            shift 2
            ;;
        -b|--benchmark)
            BENCHMARK="$2"
            shift 2
            ;;
        -p|--provider)
            PROVIDER="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

cd "$PROJECT_ROOT"

echo "RLM Analyzer CI Evaluation"
echo "=========================="
echo "Provider: $PROVIDER"
echo "Threshold: $THRESHOLD"
[ -n "$BENCHMARK" ] && echo "Benchmark: $BENCHMARK"
echo ""

# Build command
CMD="npx tsx evals/cli.ts run -t security -p $PROVIDER"
[ -n "$BENCHMARK" ] && CMD="$CMD -b $BENCHMARK"

# Run eval and capture output
OUTPUT=$($CMD 2>&1)
echo "$OUTPUT"

# Extract F1 score
F1=$(echo "$OUTPUT" | grep -oP 'Avg F1: \K[0-9.]+' | tail -1)

if [ -z "$F1" ]; then
    echo ""
    echo "ERROR: Could not extract F1 score from output"
    exit 1
fi

echo ""
echo "=========================="
echo "F1 Score: $F1"
echo "Threshold: $THRESHOLD"

# Compare using bc for floating point
PASS=$(echo "$F1 >= $THRESHOLD" | bc -l)

if [ "$PASS" -eq 1 ]; then
    echo "Status: PASS"
    exit 0
else
    echo "Status: FAIL"
    exit 1
fi
