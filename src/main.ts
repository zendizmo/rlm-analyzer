#!/usr/bin/env node
/**
 * RLM Analyzer - Unified Entry Point
 *
 * Auto-detects whether to run as MCP server or CLI:
 * - MCP mode: When stdin is not a TTY (piped input from MCP client)
 * - CLI mode: When stdin is a TTY (interactive terminal)
 *
 * This allows users to configure Claude Code with just:
 * {
 *   "mcpServers": {
 *     "rlm-analyzer": {
 *       "command": "npx",
 *       "args": ["rlm-analyzer"],
 *       "env": { "GEMINI_API_KEY": "your_key" }
 *     }
 *   }
 * }
 *
 * And still use the CLI normally:
 *   npx rlm-analyzer summary
 *   npx rlm-analyzer arch --dir /path/to/project
 */

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Explicit --mcp flag forces MCP mode
  if (args.includes('--mcp') || args.includes('--stdio')) {
    const { startMcpServer } = await import('./mcp-server.js');
    await startMcpServer();
    return;
  }

  // If there are CLI arguments (commands), run CLI
  if (args.length > 0) {
    const { runCli } = await import('./cli.js');
    await runCli();
    return;
  }

  // No arguments: use TTY detection
  // MCP clients pipe stdin, so it won't be a TTY
  if (!process.stdin.isTTY) {
    const { startMcpServer } = await import('./mcp-server.js');
    await startMcpServer();
  } else {
    // Interactive terminal with no args - show help
    const { runCli } = await import('./cli.js');
    await runCli();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
