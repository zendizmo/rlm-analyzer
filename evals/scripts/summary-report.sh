#!/bin/bash
# Generate a summary report of all eval runs
# Usage: ./evals/scripts/summary-report.sh [--last N]
#
# Options:
#   --last N    Only show last N runs (default: 10)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RESULTS_DIR="$PROJECT_ROOT/evals/results"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

LAST=10

while [[ $# -gt 0 ]]; do
    case $1 in
        --last)
            LAST="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      RLM Analyzer - Eval Summary         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

if [ ! -d "$RESULTS_DIR" ]; then
    echo -e "${YELLOW}No results found. Run some evals first!${NC}"
    exit 0
fi

# Get JSON files sorted by modification time
FILES=$(ls -t "$RESULTS_DIR"/*.json 2>/dev/null | head -n "$LAST")

if [ -z "$FILES" ]; then
    echo -e "${YELLOW}No eval results found.${NC}"
    exit 0
fi

echo -e "${CYAN}Last $LAST Eval Runs:${NC}"
echo ""
printf "%-25s %-10s %-8s %-6s %-8s %-10s\n" "Run ID" "Provider" "Success" "F1" "Turns" "Time"
echo "--------------------------------------------------------------------------------"

for FILE in $FILES; do
    RUN_ID=$(basename "$FILE" .json)

    # Extract data using grep/sed (portable)
    PROVIDER=$(grep -o '"provider": *"[^"]*"' "$FILE" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')
    TOTAL=$(grep -o '"totalCases": *[0-9]*' "$FILE" | head -1 | sed 's/.*: *//')
    SUCCESS=$(grep -o '"successfulCases": *[0-9]*' "$FILE" | head -1 | sed 's/.*: *//')
    F1=$(grep -o '"f1": *[0-9.]*' "$FILE" | head -1 | sed 's/.*: *//')
    TURNS=$(grep -o '"turnCount": *[0-9.]*' "$FILE" | head -1 | sed 's/.*: *//')
    TIME=$(grep -o '"executionTimeMs": *[0-9]*' "$FILE" | head -1 | sed 's/.*: *//')

    # Format time
    if [ -n "$TIME" ]; then
        TIME_SEC=$((TIME / 1000))
        TIME_FMT="${TIME_SEC}s"
    else
        TIME_FMT="N/A"
    fi

    # Color F1 score
    if [ -n "$F1" ]; then
        F1_VAL=$(echo "$F1" | cut -d. -f1)
        F1_DEC=$(echo "$F1" | cut -d. -f2 | head -c 2)
        if [ "${F1_VAL:-0}" -ge 1 ] || [ "${F1_DEC:-0}" -ge 70 ]; then
            F1_COLOR="${GREEN}${F1}${NC}"
        elif [ "${F1_DEC:-0}" -ge 50 ]; then
            F1_COLOR="${YELLOW}${F1}${NC}"
        else
            F1_COLOR="${F1}"
        fi
    else
        F1_COLOR="N/A"
    fi

    printf "%-25s %-10s %s/%-6s %-6s %-8s %-10s\n" \
        "$RUN_ID" "${PROVIDER:-N/A}" "${SUCCESS:-0}" "${TOTAL:-0}" "$F1" "${TURNS:-N/A}" "$TIME_FMT"
done

echo ""
echo -e "View detailed report: ${CYAN}npm run eval:report -- <run-id>${NC}"
