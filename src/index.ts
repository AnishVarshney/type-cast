#!/usr/bin/env node
/**
 * type-cast MCP server — bootstrap entrypoint.
 *
 * Stdio transport uses stdout exclusively for JSON-RPC. All diagnostics go to stderr.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerResourceHandlers } from "./mcp/handlers/resources.js";
import { registerToolHandlers } from "./mcp/handlers/tools.js";

const SERVER_NAME = "type-cast";
const SERVER_VERSION = "0.1.0";

type LogFn = (...args: unknown[]) => void;

/**
 * Installs process-level error handlers and redirects accidental `console.log`
 * calls away from stdout (which would corrupt the MCP wire protocol).
 */
function installSafeLogging(): LogFn {
  const log: LogFn = (...args) => {
    console.error(`[${SERVER_NAME}]`, ...args);
  };

  process.on("uncaughtException", (error: Error) => {
    log("uncaughtException:", error.stack ?? error.message);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason: unknown) => {
    log("unhandledRejection:", reason);
    process.exit(1);
  });

  const originalLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    log("(console.log redirected to stderr)", ...args);
    void originalLog;
  };

  return log;
}

function createServer(): Server {
  return new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
        resources: {
          subscribe: true,
          listChanged: true,
        },
      },
    },
  );
}

async function main(): Promise<void> {
  const log = installSafeLogging();

  const server = createServer();
  registerToolHandlers(server);
  registerResourceHandlers(server);

  const transport = new StdioServerTransport();

  log(`starting (v${SERVER_VERSION})`);
  await server.connect(transport);
  log("connected on stdio — tool and resource handlers registered");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : error;
  console.error(`[${SERVER_NAME}] fatal:`, message);
  process.exit(1);
});
