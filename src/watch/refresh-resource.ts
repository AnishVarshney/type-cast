import { getResourceRegistry } from "../cache/registry.js";
import { fetchOpenApiSchema } from "../tools/fetch-openapi-schema.js";
import { parseLocalTypes } from "../tools/parse-local-types.js";

const refreshLocks = new Map<string, Promise<void>>();

/**
 * Re-parses a cached resource after its backing files or remote schema changed.
 */
export async function refreshCachedResource(uri: string): Promise<void> {
  const existing = refreshLocks.get(uri);
  if (existing) {
    return existing;
  }

  const job = (async () => {
    const tracked = getResourceRegistry().get(uri);
    if (!tracked) {
      console.error(
        `[type-cast:refresh] skip ${JSON.stringify({ uri, reason: "not_tracked" })}`,
      );
      return;
    }

    console.error(
      `[type-cast:refresh] start ${JSON.stringify({ uri, kind: tracked.kind })}`,
    );

    if (tracked.kind === "types") {
      parseLocalTypes({
        packageName: tracked.packageName,
        paths: tracked.explicitPaths,
      });
    } else {
      await fetchOpenApiSchema({ url: tracked.sourceUrl });
    }

    console.error(
      `[type-cast:refresh] complete ${JSON.stringify({ uri })}`,
    );
  })().finally(() => {
    refreshLocks.delete(uri);
  });

  refreshLocks.set(uri, job);
  return job;
}
