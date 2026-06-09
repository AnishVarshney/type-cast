/** A single flattened context payload stored by URI key. */
export interface CacheEntry {
  content: string;
  revision: string;
  generatedAt: string;
}

export type CacheKind = "types" | "openapi";
