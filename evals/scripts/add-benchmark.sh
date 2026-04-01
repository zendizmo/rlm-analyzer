#!/bin/bash
# Add a new benchmark to the evals system
# Usage: ./evals/scripts/add-benchmark.sh <benchmark-id> <source-path>
#
# This will:
# 1. Copy the source code to evals/benchmarks/<id>/
# 2. Create a benchmark.json template
# 3. Create a ground-truth template for security analysis
#
# Example:
#   ./evals/scripts/add-benchmark.sh juice-shop ~/projects/juice-shop

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ $# -lt 2 ]; then
    echo -e "${RED}Usage: $0 <benchmark-id> <source-path>${NC}"
    echo ""
    echo "Example:"
    echo "  $0 juice-shop ~/projects/juice-shop"
    exit 1
fi

BENCHMARK_ID="$1"
SOURCE_PATH="$2"

if [ ! -d "$SOURCE_PATH" ]; then
    echo -e "${RED}Error: Source path does not exist: $SOURCE_PATH${NC}"
    exit 1
fi

BENCHMARK_DIR="$PROJECT_ROOT/evals/benchmarks/$BENCHMARK_ID"
GROUND_TRUTH_DIR="$PROJECT_ROOT/evals/ground-truth/$BENCHMARK_ID"

if [ -d "$BENCHMARK_DIR" ]; then
    echo -e "${RED}Error: Benchmark already exists: $BENCHMARK_ID${NC}"
    exit 1
fi

echo -e "${BLUE}Creating benchmark: $BENCHMARK_ID${NC}"
echo ""

# Create directories
mkdir -p "$BENCHMARK_DIR"
mkdir -p "$GROUND_TRUTH_DIR"

# Copy source files (excluding node_modules, .git, etc.)
echo -e "${YELLOW}Copying source files...${NC}"
rsync -av --progress "$SOURCE_PATH/" "$BENCHMARK_DIR/" \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'dist' \
    --exclude 'build' \
    --exclude '.next' \
    --exclude 'coverage' \
    --exclude '*.log' \
    --exclude '.env*'

# Count files
FILE_COUNT=$(find "$BENCHMARK_DIR" -type f | wc -l | tr -d ' ')

# Create benchmark.json
echo -e "${YELLOW}Creating benchmark.json...${NC}"
cat > "$BENCHMARK_DIR/benchmark.json" << EOF
{
  "id": "$BENCHMARK_ID",
  "name": "$BENCHMARK_ID",
  "description": "TODO: Add description",
  "path": "$BENCHMARK_ID",
  "supportedTypes": ["security", "summary", "architecture"],
  "fileCount": $FILE_COUNT,
  "source": "real-world",
  "tags": ["TODO"]
}
EOF

# Create security ground truth template
echo -e "${YELLOW}Creating ground truth template...${NC}"
cat > "$GROUND_TRUTH_DIR/security.json" << EOF
{
  "benchmark": "$BENCHMARK_ID",
  "vulnerabilities": [
    {
      "id": "VULN_001",
      "type": "TODO",
      "file": "TODO",
      "line": 0,
      "severity": "high",
      "description": "TODO: Describe the vulnerability",
      "keywords": ["TODO"],
      "cwe": "CWE-XXX"
    }
  ],
  "expectedFiles": [
    "TODO: List expected files"
  ],
  "minExpectedFindings": 1
}
EOF

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Benchmark Created!               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "Benchmark: ${BLUE}$BENCHMARK_DIR${NC}"
echo -e "Ground Truth: ${BLUE}$GROUND_TRUTH_DIR${NC}"
echo -e "Files: ${BLUE}$FILE_COUNT${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Edit $BENCHMARK_DIR/benchmark.json"
echo "   - Update name and description"
echo "   - Add relevant tags"
echo ""
echo "2. Edit $GROUND_TRUTH_DIR/security.json"
echo "   - Add known vulnerabilities"
echo "   - Set expected files and minimum findings"
echo ""
echo "3. Run eval: npm run eval -- -b $BENCHMARK_ID -t security"
