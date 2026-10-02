"use client";

import type { MediaRef, QuestionView } from "./game/types";
import { sleep } from "./utils";

export interface PreloadItem {
  kind: "image" | "audio";
  key: string;
  url: string;
}

export interface PreloadStatus {
  total: number;
  done: number;
  failed: number;
}

/** Media key → object URL of a copy downloaded ahead of time. */
const preloaded = new Map<string, string>();
/**
 * Media key → the URL first handed to the page. Every refresh re-signs links, and
 * swapping an <audio> element's src restarts the clip, so a file keeps its first URL.
 */
const pinned = new Map<string, string>();

function stable<M extends MediaRef>(media: M | null): M | null {
  if (!media?.key || !media.url) return media;
  let url = pinned.get(media.key);
  if (!url) {
    url = preloaded.get(media.key) ?? media.url;
    pinned.set(media.key, url);
  }
  return url === media.url ? media : { ...media, url };
}

/** Use the preloaded copy when there is one and keep each file's URL fixed across refreshes. */
export function withStableMedia<T extends { question: QuestionView | null }>(view: T): T {
  const q = view.question;
  if (!q || (!q.image && !q.audio)) return view;
  return { ...view, question: { ...q, image: stable(q.image), audio: stable(q.audio) } };
}

/** Drop a URL that failed to load (e.g. an expired link) so the next refresh can supply a fresh one. */
export function forgetMediaUrl(url: string) {
  for (const [key, value] of pinned) if (value === url) pinned.delete(key);
  for (const [key, value] of preloaded) {
    if (value === url) {
      preloaded.delete(key);
      URL.revokeObjectURL(value);
    }
  }
}

async function download(url: string, signal: AbortSignal): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return URL.createObjectURL(await res.blob());
    } catch (e) {
      if (signal.aborted || attempt >= 2) throw e;
      await sleep(1000 * 2 ** attempt);
    }
  }
}

/** Downloads files two at a time, reporting progress. Files that fail are streamed live instead. */
export async function preloadMedia(items: PreloadItem[], onProgress: (status: PreloadStatus) => void, signal: AbortSignal) {
  const status: PreloadStatus = { total: items.length, done: 0, failed: 0 };
  onProgress({ ...status });
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item && !signal.aborted; item = queue.shift()) {
      if (!preloaded.has(item.key)) {
        try {
          preloaded.set(item.key, await download(item.url, signal));
        } catch {
          if (signal.aborted) return;
          status.failed += 1;
          onProgress({ ...status });
          continue;
        }
      }
      status.done += 1;
      onProgress({ ...status });
    }
  };
  await Promise.all([worker(), worker()]);
}
