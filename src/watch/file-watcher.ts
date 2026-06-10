import chokidar, { type FSWatcher } from "chokidar";
import { getWorkspaceRoot } from "../lib/paths.js";
import { refreshCachedResource } from "./refresh-resource.js";

const DEFAULT_DEBOUNCE_MS = 300;

export interface FileWatcherOptions {
  debounceMs?: number;
}

/**
 * Watches registered declaration files and triggers debounced cache refresh.
 */
export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private readonly fileToUris = new Map<string, Set<string>>();
  private readonly debounceMs: number;
  private pendingPaths = new Set<string>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private readonly pendingWatches: Array<{ uri: string; files: string[] }> =
    [];

  constructor(options: FileWatcherOptions = {}) {
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  start(): void {
    if (this.started) {
      return;
    }

    const workspaceRoot = getWorkspaceRoot();
    this.watcher = chokidar.watch([], {
      cwd: workspaceRoot,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on("all", (event, filePath) => {
      this.schedulePath(filePath, event);
    });

    this.watcher.on("error", (error) => {
      console.error(
        `[type-cast:watch] error ${JSON.stringify({
          message: error instanceof Error ? error.message : String(error),
        })}`,
      );
    });

    this.started = true;

    for (const pending of this.pendingWatches) {
      this.addWatchPaths(pending.uri, pending.files);
    }
    this.pendingWatches.length = 0;

    console.error(
      `[type-cast:watch] started ${JSON.stringify({
        workspaceRoot,
        debounceMs: this.debounceMs,
      })}`,
    );
  }

  /**
   * Associates a cached resource URI with one or more filesystem paths to observe.
   */
  watchResource(uri: string, files: string[]): void {
    if (!this.started) {
      this.pendingWatches.push({ uri, files });
      console.error(
        `[type-cast:watch] watch_queued ${JSON.stringify({
          uri,
          fileCount: files.length,
        })}`,
      );
      return;
    }

    this.addWatchPaths(uri, files);
  }

  private addWatchPaths(uri: string, files: string[]): void {
    if (!this.watcher) {
      return;
    }

    for (const file of files) {
      let uris = this.fileToUris.get(file);
      if (!uris) {
        uris = new Set<string>();
        this.fileToUris.set(file, uris);
        void this.watcher.add(file);
      }
      uris.add(uri);
    }

    console.error(
      `[type-cast:watch] watch_resource ${JSON.stringify({
        uri,
        fileCount: files.length,
      })}`,
    );
  }

  private schedulePath(filePath: string, event: string): void {
    if (!this.fileToUris.has(filePath)) {
      return;
    }

    this.pendingPaths.add(filePath);
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      void this.flush(event);
    }, this.debounceMs);

    console.error(
      `[type-cast:watch] change_buffered ${JSON.stringify({
        event,
        filePath,
        pending: this.pendingPaths.size,
        debounceMs: this.debounceMs,
      })}`,
    );
  }

  private async flush(triggerEvent: string): Promise<void> {
    const paths = [...this.pendingPaths];
    this.pendingPaths.clear();
    this.debounceTimer = null;

    const uris = new Set<string>();
    for (const filePath of paths) {
      for (const uri of this.fileToUris.get(filePath) ?? []) {
        uris.add(uri);
      }
    }

    if (uris.size === 0) {
      return;
    }

    console.error(
      `[type-cast:watch] flush ${JSON.stringify({
        triggerEvent,
        pathCount: paths.length,
        uriCount: uris.size,
      })}`,
    );

    for (const uri of uris) {
      try {
        await refreshCachedResource(uri);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[type-cast:watch] refresh_failed ${JSON.stringify({ uri, message })}`,
        );
      }
    }
  }

  async close(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.pendingPaths.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.started = false;
    console.error("[type-cast:watch] closed");
  }
}
