#!/bin/bash
# Run all evaluations across all benchmarks
# Usage: ./evals/scripts/run-all.sh [options]
#
# Options:
#   -v, --verbose    Show detailed output
#   -p, --provider   Provider to use (gemini, bedrock)
#   -m, --model      Model to use

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     RLM Analyzer - Full Eval Suite       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

cd "$PROJECT_ROOT"

# Parse arguments
ARGS=""
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose)
            ARGS="$ARGS -v"
            shift
            ;;
        -p|--provider)
            ARGS="$ARGS -p $2"
            shift 2
            ;;
        -m|--model)
            ARGS="$ARGS -m $2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Run security evals
echo -e "${YELLOW}Running security evaluations...${NC}"
npx tsx evals/cli.ts run -t security $ARGS

# Run summary evals
echo -e "${YELLOW}Running summary evaluations...${NC}"
npx tsx evals/cli.ts run -t summary $ARGS

# Run architecture evals
echo -e "${YELLOW}Running architecture evaluations...${NC}"
npx tsx evals/cli.ts run -t architecture $ARGS

echo ""
echo -e "${GREEN}All evaluations complete!${NC}"
echo -e "View results: ${BLUE}npm run eval:results${NC}"
