import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ErrorCode,
  ListResourceTemplatesRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const FLATTEN_SCHEME = "flatten://";

/** MCP spec: resource not found (application-defined JSON-RPC error). */
const RESOURCE_NOT_FOUND = -32002;

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: "flatten://types/{packageName}",
    name: "Flattened TypeScript Package Declarations",
    description:
      "Exposes a plain-text, token-efficient view of exported types, interfaces, and namespaces for a given node package.",
    mimeType: "text/plain",
  },
  {
    uriTemplate: "flatten://openapi/{schemaId}",
    name: "Flattened OpenAPI Specification Summary",
    description:
      "Exposes a compressed markdown layout detailing paths, parameters, and structural payload schemas for an ingested API.",
    mimeType: "text/plain",
  },
] as const;

const EXAMPLE_PACKAGE_NAME = "example-pkg";

type FlattenUri =
  | { kind: "types"; packageName: string }
  | { kind: "openapi"; schemaId: string };

function logResourceEvent(
  event: string,
  metadata: Record<string, string>,
): void {
  console.error(
    `[type-cast:resources] ${event}`,
    JSON.stringify(metadata),
  );
}

function parseFlattenUri(uri: string): FlattenUri | null {
  if (!uri.startsWith(FLATTEN_SCHEME)) {
    return null;
  }

  const path = uri.slice(FLATTEN_SCHEME.length);

  const typesMatch = /^types\/([^/]+)$/.exec(path);
  if (typesMatch?.[1]) {
    return {
      kind: "types",
      packageName: decodeURIComponent(typesMatch[1]),
    };
  }

  const openapiMatch = /^openapi\/([^/]+)$/.exec(path);
  if (openapiMatch?.[1]) {
    return {
      kind: "openapi",
      schemaId: decodeURIComponent(openapiMatch[1]),
    };
  }

  return null;
}

function buildExampleTypesMock(uri: string, packageName: string) {
  const text = [
    "# type-cast flatten (mock)",
    `source: ${uri}`,
    `package: ${packageName}`,
    "revision: phase-1-placeholder",
    "",
    "## exports",
    "- interface ExampleConfig {",
    "    baseURL: string;",
    "    timeout?: number;",
    "  }",
    "- type ExampleResponse<T> = { data: T; status: number };",
    "- namespace ExampleHelpers {",
    "    function createClient(config: ExampleConfig): ExampleClient;",
    "  }",
    "",
    "## note",
    "Phase 2 CacheStore will replace this mock with live @types flatten output.",
  ].join("\n");

  return {
    contents: [
      {
        uri,
        mimeType: "text/plain",
        text,
      },
    ],
  };
}

function resourceNotFound(uri: string, detail: string): never {
  logResourceEvent("read_miss", { uri, detail });
  throw new McpError(RESOURCE_NOT_FOUND, "Resource not found", { uri, detail });
}

/**
 * Registers MCP resource template discovery and read handlers for `flatten://` URIs.
 */
export function registerResourceHandlers(server: Server): void {
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [...RESOURCE_TEMPLATES],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    logResourceEvent("read_request", { uri });

    if (!uri.startsWith(FLATTEN_SCHEME)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unsupported URI scheme — expected ${FLATTEN_SCHEME}`,
        { uri },
      );
    }

    const parsed = parseFlattenUri(uri);
    if (!parsed) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "URI does not match a supported flatten:// template",
        { uri },
      );
    }

    if (parsed.kind === "types") {
      if (parsed.packageName === EXAMPLE_PACKAGE_NAME) {
        logResourceEvent("read_hit", {
          uri,
          kind: "types",
          packageName: parsed.packageName,
        });
        return buildExampleTypesMock(uri, parsed.packageName);
      }

      resourceNotFound(
        uri,
        `No cached flatten output for package "${parsed.packageName}". Call parse_local_types first (Phase 2).`,
      );
    }

    resourceNotFound(
      uri,
      `No cached flatten output for OpenAPI schema "${parsed.schemaId}". Call fetch_openapi_schema first (Phase 2).`,
    );
  });
}
