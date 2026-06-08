import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/** Runtime validation for `fetch_openapi_schema` arguments. */
export const fetchOpenApiSchemaInputSchema = z.object({
  url: z.string().url({ message: "url must be a valid URL string" }),
});

/** Runtime validation for `parse_local_types` arguments. */
export const parseLocalTypesInputSchema = z.object({
  packageName: z
    .string()
    .min(1, { message: "packageName must be a non-empty string" }),
  paths: z.array(z.string()).optional(),
});

const TOOL_NAMES = {
  fetchOpenApiSchema: "fetch_openapi_schema",
  parseLocalTypes: "parse_local_types",
} as const;

const TOOL_DEFINITIONS = [
  {
    name: TOOL_NAMES.fetchOpenApiSchema,
    description:
      "Download and parse an external OpenAPI 3.x document (JSON or YAML) from a URL. " +
      "Use this when you need accurate endpoint paths, request/response shapes, or schema " +
      "definitions from a remote API specification instead of relying on memorized or hallucinated interfaces.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          format: "uri",
          description:
            "HTTPS URL pointing to an OpenAPI 3.x document in JSON or YAML format",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: TOOL_NAMES.parseLocalTypes,
    description:
      "Inspect and flatten TypeScript type declarations from node_modules/@types/<package> " +
      "or from explicit local .d.ts paths. Use this when you need grounded interface and type " +
      "definitions from the project's installed typings rather than inferred or outdated signatures.",
    inputSchema: {
      type: "object" as const,
      properties: {
        packageName: {
          type: "string",
          description:
            "npm package name to resolve (e.g. 'axios' resolves to @types/axios when present)",
        },
        paths: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional explicit .d.ts file paths to include when resolving declarations",
        },
      },
      required: ["packageName"],
      additionalProperties: false,
    },
  },
] as const;

function placeholderResult(toolName: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Parser placeholder for ${toolName} — Implementation arriving in Phase 2`,
      },
    ],
    isError: false,
  };
}

function toolExecutionError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

/**
 * Registers MCP tool discovery (`tools/list`) and execution (`tools/call`) handlers.
 */
export function registerToolHandlers(server: Server): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...TOOL_DEFINITIONS],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case TOOL_NAMES.fetchOpenApiSchema: {
        const parsed = fetchOpenApiSchemaInputSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return toolExecutionError(
            `Input validation error: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
          );
        }
        return placeholderResult(TOOL_NAMES.fetchOpenApiSchema);
      }

      case TOOL_NAMES.parseLocalTypes: {
        const parsed = parseLocalTypesInputSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return toolExecutionError(
            `Input validation error: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
          );
        }
        return placeholderResult(TOOL_NAMES.parseLocalTypes);
      }

      default:
        throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
    }
  });
}
