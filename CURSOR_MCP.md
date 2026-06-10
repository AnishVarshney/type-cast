# type-cast — Cursor MCP Integration Guide

Use this guide to register the **type-cast** MCP server in Cursor so the host can invoke `fetch_openapi_schema`, `parse_local_types`, and read `flatten://` resources.

## Prerequisites

1. Build the server from the project root:

```bash
cd /absolute/path/to/type-cast
npm install
npm run build
```

2. Confirm `dist/index.js` exists after the build completes.

## Option A — Project-scoped config (recommended)

Create or edit `.cursor/mcp.json` **inside the workspace** you want type-cast to analyze:

```json
{
  "mcpServers": {
    "type-cast": {
      "command": "node",
      "args": ["/absolute/path/to/type-cast/dist/index.js"],
      "env": {
        "TYPE_CAST_WORKSPACE": "/absolute/path/to/your/application"
      }
    }
  }
}
```

| Field | Purpose |
|-------|---------|
| `command` | Node.js runtime (v20+) |
| `args` | Absolute path to the compiled server entrypoint |
| `TYPE_CAST_WORKSPACE` | Root directory for `@types` resolution, `.d.ts` paths, and file watchers |

Replace both absolute paths with your local paths.

## Option B — Global Cursor MCP settings

1. Open **Cursor Settings** → **MCP** (or edit your user-level MCP config).
2. Add the same `type-cast` block from Option A to the global `mcpServers` object.
3. Set `TYPE_CAST_WORKSPACE` to the project whose typings and APIs you want flattened.

## Development mode (TypeScript watch)

For active server development without rebuilding:

```json
{
  "mcpServers": {
    "type-cast": {
      "command": "npx",
      "args": [
        "tsx",
        "/absolute/path/to/type-cast/src/index.ts"
      ],
      "env": {
        "TYPE_CAST_WORKSPACE": "/absolute/path/to/your/application"
      }
    }
  }
}
```

## Verify the connection

1. Restart Cursor or reload MCP servers from the MCP panel.
2. Confirm **type-cast** appears with tools:
   - `fetch_openapi_schema`
   - `parse_local_types`
3. Run `parse_local_types` for a package (e.g. `node`) in your workspace.
4. Attach context via resource URI, e.g. `flatten://types/node`.

## Run the local verification harness (Phase 4)

Before production use, run the security and parse checks:

```bash
npm run test:harness
```

This validates path traversal blocking, SSRF loopback rejection, and live `.d.ts` flattening into `CacheStore` — without starting the stdio MCP transport.
