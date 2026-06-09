import { createHash } from "node:crypto";
import { buildFlattenUri } from "../../resources/flatten-uri.js";
import type { OpenApiDocument } from "./fetcher.js";

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
]);

function summarizeSchema(schema: unknown, depth = 0): string {
  if (!schema || depth > 2) {
    return "unknown";
  }

  if (typeof schema !== "object") {
    return String(schema);
  }

  const record = schema as Record<string, unknown>;

  if (typeof record["$ref"] === "string") {
    return record["$ref"];
  }

  if (record["type"] === "array" && record["items"]) {
    return `array<${summarizeSchema(record["items"], depth + 1)}>`;
  }

  if (record["type"] === "object" && record["properties"]) {
    const props = record["properties"] as Record<string, unknown>;
    const keys = Object.keys(props).slice(0, 8);
    const summary = keys
      .map((key) => `${key}: ${summarizeSchema(props[key], depth + 1)}`)
      .join(", ");
    return `{ ${summary}${Object.keys(props).length > 8 ? ", ..." : ""} }`;
  }

  if (typeof record["type"] === "string") {
    return record["type"];
  }

  return "object";
}

function formatParameters(operation: Record<string, unknown>): string {
  const params = operation["parameters"];
  if (!Array.isArray(params) || params.length === 0) {
    return "";
  }

  const parts = params
    .slice(0, 6)
    .map((param) => {
      if (typeof param !== "object" || param === null) {
        return "param: unknown";
      }
      const p = param as Record<string, unknown>;
      const name = typeof p["name"] === "string" ? p["name"] : "param";
      const location = typeof p["in"] === "string" ? p["in"] : "query";
      const required = p["required"] === true ? "required" : "optional";
      const schema = summarizeSchema(p["schema"]);
      return `${name} (${location}, ${required}): ${schema}`;
    })
    .join("; ");

  return `params: ${parts}`;
}

function formatResponse(operation: Record<string, unknown>): string {
  const responses = operation["responses"];
  if (typeof responses !== "object" || responses === null) {
    return "response: unknown";
  }

  const responseMap = responses as Record<string, unknown>;
  const successKey =
    Object.keys(responseMap).find((code) => code.startsWith("2")) ??
    Object.keys(responseMap)[0];

  if (!successKey) {
    return "response: unknown";
  }

  const success = responseMap[successKey];
  if (typeof success !== "object" || success === null) {
    return `response: ${successKey}`;
  }

  const successObj = success as Record<string, unknown>;
  const content = successObj["content"];
  if (typeof content !== "object" || content === null) {
    return `response: ${successKey}`;
  }

  const jsonContent = (content as Record<string, unknown>)["application/json"];
  if (typeof jsonContent !== "object" || jsonContent === null) {
    return `response: ${successKey}`;
  }

  const schema = (jsonContent as Record<string, unknown>)["schema"];
  return `response: ${successKey} ${summarizeSchema(schema)}`;
}

/**
 * Flattens an OpenAPI document into the blueprint endpoint summary layout.
 */
export function flattenOpenApiDocument(
  schemaId: string,
  document: OpenApiDocument,
  sourceUrl: string,
): string {
  const uri = buildFlattenUri("openapi", schemaId);
  const generatedAt = new Date().toISOString();
  const title = document.info?.title ?? "Untitled API";
  const version = document.info?.version ?? "unknown";
  const endpointLines: string[] = [];

  const paths = document.paths ?? {};
  for (const [route, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) {
        continue;
      }
      if (typeof operation !== "object" || operation === null) {
        continue;
      }

      const op = operation as Record<string, unknown>;
      const summary =
        typeof op["summary"] === "string" ? op["summary"] : undefined;
      const paramLine = formatParameters(op);
      const responseLine = formatResponse(op);

      endpointLines.push(`- ${method.toUpperCase()} ${route}`);
      if (summary) {
        endpointLines.push(`  summary: ${summary}`);
      }
      if (paramLine) {
        endpointLines.push(`  ${paramLine}`);
      }
      endpointLines.push(`  ${responseLine}`);
    }
  }

  if (endpointLines.length === 0) {
    endpointLines.push("- (no HTTP operations found in paths)");
  }

  const body = ["## endpoints", ...endpointLines].join("\n");
  const revision = createHash("sha256").update(body).digest("hex").slice(0, 8);

  return [
    "# type-cast flatten",
    `source: ${uri}`,
    `schemaId: ${schemaId}`,
    `sourceUrl: ${sourceUrl}`,
    `title: ${title}`,
    `version: ${version}`,
    `revision: ${revision}`,
    `generatedAt: ${generatedAt}`,
    "",
    body,
  ].join("\n");
}
