import { getResourceRegistry } from "../cache/registry.js";
import { getCacheStore } from "../cache/store.js";
import { flattenTypeDeclarations } from "../parsers/typescript/flatten.js";
import { resolveTypesPackage } from "../parsers/typescript/resolver.js";
import { buildFlattenUri } from "../resources/flatten-uri.js";

export interface ParseLocalTypesInput {
  packageName: string;
  paths?: string[] | undefined;
}

export interface ParseLocalTypesResult {
  uri: string;
  revision: string;
  generatedAt: string;
  summary: string;
  content: string;
}

/**
 * Resolves, flattens, and caches TypeScript declarations for a package.
 */
export function parseLocalTypes(
  input: ParseLocalTypesInput,
): ParseLocalTypesResult {
  const resolved = resolveTypesPackage(input.packageName, input.paths);
  const uri = buildFlattenUri("types", input.packageName);
  const cache = getCacheStore();

  getResourceRegistry().track({
    kind: "types",
    uri,
    packageName: resolved.packageName,
    explicitPaths: input.paths,
    sourceFiles: resolved.files,
  });

  const content = flattenTypeDeclarations(
    resolved.packageName,
    resolved.files,
    resolved.sourceLabel,
  );

  const entry = cache.set(uri, content);

  const summary = [
    `Cached flattened types for "${resolved.packageName}" from ${resolved.sourceLabel}.`,
    `Resource URI: ${uri}`,
    `Revision: ${entry.revision}`,
    `Files scanned: ${resolved.files.length}`,
  ].join("\n");

  console.error(
    `[type-cast:tools] parse_local_types ${JSON.stringify({
      packageName: input.packageName,
      uri,
      revision: entry.revision,
      fileCount: resolved.files.length,
    })}`,
  );

  return {
    uri,
    revision: entry.revision,
    generatedAt: entry.generatedAt,
    summary,
    content,
  };
}
