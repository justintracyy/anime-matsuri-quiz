"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { preloadMedia, type PreloadItem, type PreloadStatus } from "@/lib/media-cache";
import { sleep } from "@/lib/utils";

/** Downloads every song and picture in the game to the host device, so questions don't wait on the network. */
export function useMediaPreload(sessionId: string): PreloadStatus | null {
  const [status, setStatus] = useState<PreloadStatus | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      for (let attempt = 0; !controller.signal.aborted; attempt++) {
        try {
          const { items } = await apiFetch<{ items: PreloadItem[] }>(`/api/admin/sessions/${sessionId}/media`, { signal: controller.signal });
          await preloadMedia(items, setStatus, controller.signal);
          return;
        } catch {
          if (controller.signal.aborted) return;
          await sleep(Math.min(30_000, 2000 * 2 ** attempt));
        }
      }
    })();
    return () => controller.abort();
  }, [sessionId]);
  return status;
}
