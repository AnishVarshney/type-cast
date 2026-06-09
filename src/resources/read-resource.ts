import { getCacheStore } from "../cache/store.js";
import { parseFlattenUri } from "./flatten-uri.js";

export function readCachedResource(uri: string):
  | {
      contents: Array<{
        uri: string;
        mimeType: string;
        text: string;
      }>;
    }
  | null {
  const parsed = parseFlattenUri(uri);
  if (!parsed) {
    return null;
  }

  const cache = getCacheStore();
  const entry = cache.get(uri);
  if (!entry) {
    return null;
  }

  return {
    contents: [
      {
        uri,
        mimeType: "text/plain",
        text: entry.content,
      },
    ],
  };
}
