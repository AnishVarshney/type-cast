import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { CacheUpdateEvent } from "../cache/types.js";

/**
 * Tracks subscribed / fetched URIs and emits MCP resource change notifications.
 */
export class ResourceNotificationService {
  private readonly subscriptions = new Set<string>();
  private readonly fetchedUris = new Set<string>();

  constructor(private readonly server: Server) {}

  subscribe(uri: string): void {
    this.subscriptions.add(uri);
    console.error(
      `[type-cast:notifications] subscribe ${JSON.stringify({ uri })}`,
    );
  }

  unsubscribe(uri: string): void {
    this.subscriptions.delete(uri);
    console.error(
      `[type-cast:notifications] unsubscribe ${JSON.stringify({ uri })}`,
    );
  }

  markFetched(uri: string): void {
    this.fetchedUris.add(uri);
  }

  isSubscribed(uri: string): boolean {
    return this.subscriptions.has(uri);
  }

  /**
   * Called after CacheStore writes. New keys → list_changed; updates → updated.
   */
  async onCacheUpdate(event: CacheUpdateEvent): Promise<void> {
    const { uri, isNew } = event;
    this.fetchedUris.add(uri);

    try {
      if (isNew) {
        await this.server.sendResourceListChanged();
        console.error(
          `[type-cast:notifications] list_changed ${JSON.stringify({ uri })}`,
        );
        return;
      }

      await this.server.sendResourceUpdated({ uri });
      console.error(
        `[type-cast:notifications] updated ${JSON.stringify({
          uri,
          revision: event.entry.revision,
          subscribed: this.subscriptions.has(uri),
        })}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[type-cast:notifications] emit_failed ${JSON.stringify({ uri, message })}`,
      );
    }
  }
}
