import { createHash } from "node:crypto";
import type { CacheEntry, CacheKind } from "./types.js";

function createRevision(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 8);
}

function cacheKey(kind: CacheKind, id: string): string {
  return `flatten://${kind}/${encodeURIComponent(id)}`;
}

/**
 * In-memory singleton cache for flattened type and OpenAPI context payloads.
 */
export class CacheStore {
  private readonly entries = new Map<string, CacheEntry>();

  private static instance: CacheStore | null = null;

  static getInstance(): CacheStore {
    CacheStore.instance ??= new CacheStore();
    return CacheStore.instance;
  }

  /** @internal Test-only reset — not for production use. */
  static resetInstance(): void {
    CacheStore.instance = null;
  }

  get(uri: string): CacheEntry | undefined {
    return this.entries.get(uri);
  }

  has(uri: string): boolean {
    return this.entries.has(uri);
  }

  getByKind(kind: CacheKind, id: string): CacheEntry | undefined {
    return this.get(cacheKey(kind, id));
  }

  set(uri: string, content: string): CacheEntry {
    const revisionMatch = /^revision: ([a-f0-9]+)$/m.exec(content);
    const generatedAtMatch = /^generatedAt: (.+)$/m.exec(content);

    const entry: CacheEntry = {
      content,
      revision: revisionMatch?.[1] ?? createRevision(content),
      generatedAt: generatedAtMatch?.[1] ?? new Date().toISOString(),
    };
    this.entries.set(uri, entry);
    console.error(
      `[type-cast:cache] set ${JSON.stringify({ uri, revision: entry.revision })}`,
    );
    return entry;
  }

  setByKind(kind: CacheKind, id: string, content: string): CacheEntry {
    return this.set(cacheKey(kind, id), content);
  }

  delete(uri: string): boolean {
    return this.entries.delete(uri);
  }

  listUris(): string[] {
    return [...this.entries.keys()];
  }
}

export function getCacheStore(): CacheStore {
  return CacheStore.getInstance();
}

export { cacheKey };
