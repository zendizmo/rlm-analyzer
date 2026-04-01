#!/bin/bash
# Compare Gemini vs Bedrock providers on security analysis
# Usage: ./evals/scripts/compare-providers.sh [benchmark]
#
# Example:
#   ./evals/scripts/compare-providers.sh vulnerable-express

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

BENCHMARK=${1:-""}
BENCHMARK_ARG=""
if [ -n "$BENCHMARK" ]; then
    BENCHMARK_ARG="-b $BENCHMARK"
fi

echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Provider Comparison: Gemini vs Bedrock║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

cd "$PROJECT_ROOT"

# Check for Gemini API key
if [ -z "$GEMINI_API_KEY" ] && [ -z "$RLM_API_KEY" ]; then
    echo -e "${YELLOW}Warning: GEMINI_API_KEY not set. Gemini tests may fail.${NC}"
fi

# Check for AWS credentials
if [ -z "$AWS_ACCESS_KEY_ID" ] && [ -z "$AWS_PROFILE" ]; then
    echo -e "${YELLOW}Warning: AWS credentials not set. Bedrock tests may fail.${NC}"
fi

RESULTS_DIR="$PROJECT_ROOT/evals/results"
mkdir -p "$RESULTS_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
COMPARISON_FILE="$RESULTS_DIR/comparison-$TIMESTAMP.md"

echo "# Provider Comparison Report" > "$COMPARISON_FILE"
echo "" >> "$COMPARISON_FILE"
echo "**Date:** $(date)" >> "$COMPARISON_FILE"
echo "" >> "$COMPARISON_FILE"

# Run Gemini eval
echo -e "${CYAN}Testing Gemini...${NC}"
GEMINI_START=$(date +%s)
npx tsx evals/cli.ts run -t security -p gemini $BENCHMARK_ARG -v 2>&1 | tee /tmp/gemini_eval.log
GEMINI_END=$(date +%s)
GEMINI_TIME=$((GEMINI_END - GEMINI_START))

# Extract Gemini results
GEMINI_F1=$(grep -oP 'F1: \K[0-9.]+' /tmp/gemini_eval.log | tail -1 || echo "N/A")
GEMINI_TURNS=$(grep -oP 'Avg Turns: \K[0-9.]+' /tmp/gemini_eval.log | tail -1 || echo "N/A")

echo "" >> "$COMPARISON_FILE"
echo "## Gemini Results" >> "$COMPARISON_FILE"
echo "- **F1 Score:** $GEMINI_F1" >> "$COMPARISON_FILE"
echo "- **Avg Turns:** $GEMINI_TURNS" >> "$COMPARISON_FILE"
echo "- **Total Time:** ${GEMINI_TIME}s" >> "$COMPARISON_FILE"

# Run Bedrock eval
echo ""
echo -e "${CYAN}Testing Bedrock...${NC}"
BEDROCK_START=$(date +%s)
npx tsx evals/cli.ts run -t security -p bedrock $BENCHMARK_ARG -v 2>&1 | tee /tmp/bedrock_eval.log || true
BEDROCK_END=$(date +%s)
BEDROCK_TIME=$((BEDROCK_END - BEDROCK_START))

# Extract Bedrock results
BEDROCK_F1=$(grep -oP 'F1: \K[0-9.]+' /tmp/bedrock_eval.log | tail -1 || echo "N/A")
BEDROCK_TURNS=$(grep -oP 'Avg Turns: \K[0-9.]+' /tmp/bedrock_eval.log | tail -1 || echo "N/A")

echo "" >> "$COMPARISON_FILE"
echo "## Bedrock Results" >> "$COMPARISON_FILE"
echo "- **F1 Score:** $BEDROCK_F1" >> "$COMPARISON_FILE"
echo "- **Avg Turns:** $BEDROCK_TURNS" >> "$COMPARISON_FILE"
echo "- **Total Time:** ${BEDROCK_TIME}s" >> "$COMPARISON_FILE"

# Summary
echo "" >> "$COMPARISON_FILE"
echo "## Summary" >> "$COMPARISON_FILE"
echo "" >> "$COMPARISON_FILE"
echo "| Provider | F1 Score | Turns | Time |" >> "$COMPARISON_FILE"
echo "|----------|----------|-------|------|" >> "$COMPARISON_FILE"
echo "| Gemini   | $GEMINI_F1 | $GEMINI_TURNS | ${GEMINI_TIME}s |" >> "$COMPARISON_FILE"
echo "| Bedrock  | $BEDROCK_F1 | $BEDROCK_TURNS | ${BEDROCK_TIME}s |" >> "$COMPARISON_FILE"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Comparison Complete            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Results:${NC}"
echo -e "  Gemini:  F1=${GEMINI_F1}, Turns=${GEMINI_TURNS}, Time=${GEMINI_TIME}s"
echo -e "  Bedrock: F1=${BEDROCK_F1}, Turns=${BEDROCK_TURNS}, Time=${BEDROCK_TIME}s"
echo ""
echo -e "Full report: ${CYAN}$COMPARISON_FILE${NC}"
