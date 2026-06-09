import { getCacheStore } from "../cache/store.js";
import {
  fetchOpenApiDocument,
} from "../parsers/openapi/fetcher.js";
import { flattenOpenApiDocument } from "../parsers/openapi/flatten.js";
import { buildFlattenUri } from "../resources/flatten-uri.js";

export interface FetchOpenApiSchemaInput {
  url: string;
}

export interface FetchOpenApiSchemaResult {
  uri: string;
  schemaId: string;
  revision: string;
  generatedAt: string;
  summary: string;
  content: string;
}

/**
 * Fetches, flattens, and caches an OpenAPI document from a remote URL.
 */
export async function fetchOpenApiSchema(
  input: FetchOpenApiSchemaInput,
): Promise<FetchOpenApiSchemaResult> {
  const { schemaId, document, sourceUrl } = await fetchOpenApiDocument(
    input.url,
  );
  const uri = buildFlattenUri("openapi", schemaId);
  const cache = getCacheStore();

  const content = flattenOpenApiDocument(schemaId, document, sourceUrl);

  const entry = cache.set(uri, content);

  const pathCount = Object.keys(document.paths ?? {}).length;
  const summary = [
    `Cached flattened OpenAPI schema "${document.info?.title ?? schemaId}".`,
    `Source URL: ${sourceUrl}`,
    `Resource URI: ${uri}`,
    `Revision: ${entry.revision}`,
    `Paths indexed: ${pathCount}`,
  ].join("\n");

  console.error(
    `[type-cast:tools] fetch_openapi_schema ${JSON.stringify({
      url: input.url,
      schemaId,
      uri,
      revision: entry.revision,
      pathCount,
    })}`,
  );

  return {
    uri,
    schemaId,
    revision: entry.revision,
    generatedAt: entry.generatedAt,
    summary,
    content,
  };
}
