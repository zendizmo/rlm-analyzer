#!/bin/bash
# Quick sanity test - runs security eval on vulnerable-express
# Usage: ./evals/scripts/quick-test.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Quick Eval Test${NC}"
echo "================"
echo ""

cd "$PROJECT_ROOT"

# Run single benchmark
npx tsx evals/cli.ts run -b vulnerable-express -t security

echo ""
echo -e "${GREEN}Quick test complete!${NC}"
