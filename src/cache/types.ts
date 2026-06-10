/** A single flattened context payload stored by URI key. */
export interface CacheEntry {
  content: string;
  revision: string;
  generatedAt: string;
}

export type CacheKind = "types" | "openapi";

/** Emitted when a cache entry is created or replaced. */
export interface CacheUpdateEvent {
  uri: string;
  isNew: boolean;
  entry: CacheEntry;
}

export type CacheUpdateListener = (event: CacheUpdateEvent) => void;
