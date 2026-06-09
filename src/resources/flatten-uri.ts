export const FLATTEN_SCHEME = "flatten://";

export type FlattenUri =
  | { kind: "types"; packageName: string }
  | { kind: "openapi"; schemaId: string };

export function buildFlattenUri(kind: "types", id: string): string;
export function buildFlattenUri(kind: "openapi", id: string): string;
export function buildFlattenUri(kind: "types" | "openapi", id: string): string {
  return `${FLATTEN_SCHEME}${kind}/${encodeURIComponent(id)}`;
}

export function parseFlattenUri(uri: string): FlattenUri | null {
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
