#!/bin/bash
# Wrapper script for RLM Analyzer MCP server
# Ensures proper stdio handling
exec node "$(dirname "$0")/dist/mcp-server.js" "$@"
