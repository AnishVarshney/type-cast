import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ErrorCode,
  ListResourceTemplatesRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ResourceNotificationService } from "../resource-notifications.js";
import {
  FLATTEN_SCHEME,
  parseFlattenUri,
} from "../../resources/flatten-uri.js";
import { readCachedResource } from "../../resources/read-resource.js";

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

function logResourceEvent(
  event: string,
  metadata: Record<string, string>,
): void {
  console.error(
    `[type-cast:resources] ${event}`,
    JSON.stringify(metadata),
  );
}

function resourceNotFound(uri: string, detail: string): never {
  logResourceEvent("read_miss", { uri, detail });
  throw new McpError(RESOURCE_NOT_FOUND, "Resource not found", { uri, detail });
}

/**
 * Registers MCP resource template discovery, read, and subscription handlers.
 */
export function registerResourceHandlers(
  server: Server,
  notifications: ResourceNotificationService,
): void {
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [...RESOURCE_TEMPLATES],
  }));

  server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    const { uri } = request.params;

    if (!uri.startsWith(FLATTEN_SCHEME) || !parseFlattenUri(uri)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Cannot subscribe to unsupported URI: ${uri}`,
        { uri },
      );
    }

    notifications.subscribe(uri);
    return {};
  });

  server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
    notifications.unsubscribe(request.params.uri);
    return {};
  });

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

    const cached = readCachedResource(uri);
    if (cached) {
      notifications.markFetched(uri);
      logResourceEvent("read_hit", {
        uri,
        kind: parsed.kind,
      });
      return cached;
    }

    if (parsed.kind === "types") {
      resourceNotFound(
        uri,
        `No cached flatten output for package "${parsed.packageName}". Call parse_local_types first.`,
      );
    }

    resourceNotFound(
      uri,
      `No cached flatten output for OpenAPI schema "${parsed.schemaId}". Call fetch_openapi_schema first.`,
    );
  });
}
