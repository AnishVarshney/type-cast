 import type { CacheKind } from "./types.js";

export interface TrackedTypesResource {
  kind: "types";
  uri: string;
  packageName: string;
  explicitPaths?: string[] | undefined;
  sourceFiles: string[];
}

export interface TrackedOpenApiResource {
  kind: "openapi";
  uri: string;
  schemaId: string;
  sourceUrl: string;
}

export type TrackedResource = TrackedTypesResource | TrackedOpenApiResource;

export type ResourceTrackListener = (resource: TrackedResource) => void;

/**
 * Maps cached resource URIs to their backing sources for hot-reload refresh.
 */
export class ResourceRegistry {
  private readonly resources = new Map<string, TrackedResource>();
  private readonly listeners: ResourceTrackListener[] = [];
  private static instance: ResourceRegistry | null = null;

  static getInstance(): ResourceRegistry {
    ResourceRegistry.instance ??= new ResourceRegistry();
    return ResourceRegistry.instance;
  }

  /** @internal Test-only reset — not for production use. */
  static resetInstance(): void {
    ResourceRegistry.instance = null;
  }

  track(resource: TrackedResource): void {
    this.resources.set(resource.uri, resource);
    console.error(
      `[type-cast:registry] track ${JSON.stringify({
        uri: resource.uri,
        kind: resource.kind,
      })}`,
    );
    for (const listener of this.listeners) {
      listener(resource);
    }
  }

  get(uri: string): TrackedResource | undefined {
    return this.resources.get(uri);
  }

  list(): TrackedResource[] {
    return [...this.resources.values()];
  }

  addListener(listener: ResourceTrackListener): void {
    this.listeners.push(listener);
  }
}

export function getResourceRegistry(): ResourceRegistry {
  return ResourceRegistry.getInstance();
}
