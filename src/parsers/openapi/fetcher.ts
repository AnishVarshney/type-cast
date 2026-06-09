import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/,
];

export interface OpenApiDocument {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, unknown> };
}

export function urlToSchemaId(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 12);
}

function assertSafeUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Only http(s) URLs are allowed, got: ${parsed.protocol}`);
  }

  const host = parsed.hostname;
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    throw new Error(`Fetching from private or loopback hosts is not allowed: ${host}`);
  }

  return parsed;
}

function parseOpenApiBody(text: string, contentType: string | null): OpenApiDocument {
  const trimmed = text.trim();
  const isYaml =
    contentType?.includes("yaml") ||
    contentType?.includes("yml") ||
    (!trimmed.startsWith("{") && !trimmed.startsWith("["));

  if (isYaml) {
    return parseYaml(text) as OpenApiDocument;
  }

  return JSON.parse(text) as OpenApiDocument;
}

/**
 * Downloads and parses an OpenAPI document from a remote URL.
 */
export async function fetchOpenApiDocument(url: string): Promise<{
  schemaId: string;
  document: OpenApiDocument;
  sourceUrl: string;
}> {
  assertSafeUrl(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json, application/yaml, text/yaml, */*" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      throw new Error(
        `Response exceeds maximum size of ${MAX_RESPONSE_BYTES} bytes`,
      );
    }

    const text = new TextDecoder().decode(buffer);
    const contentType = response.headers.get("content-type");
    const document = parseOpenApiBody(text, contentType);

    if (!document.paths && !document.openapi && !document.swagger) {
      throw new Error("Document does not appear to be a valid OpenAPI specification");
    }

    return {
      schemaId: urlToSchemaId(url),
      document,
      sourceUrl: url,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
