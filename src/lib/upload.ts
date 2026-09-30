"use client";

import { apiFetch } from "./api/client";
import { MEDIA_BUCKET } from "./constants";
import { getSupabaseBrowser } from "./supabase/browser";

export type MediaVariant = "original" | "display" | "silhouette" | "blurred";

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
};

export function guessContentType(file: { name: string; type?: string }): string {
  if (file.type) return file.type;
  const ext = (/\.([a-z0-9]+)$/i.exec(file.name)?.[1] ?? "").toLowerCase();
  return EXT_MIME[ext] ?? "application/octet-stream";
}

/**
 * Upload directly from the browser to Supabase Storage with a signed upload URL
 * issued by the server (which validates the type and size first).
 */
export async function uploadMedia(
  blob: Blob,
  opts: { quizId: string | null; fileName: string; kind: "image" | "audio"; variant?: MediaVariant; contentType?: string },
): Promise<string> {
  const contentType = opts.contentType ?? guessContentType({ name: opts.fileName, type: blob.type });
  const { path, token } = await apiFetch<{ path: string; token: string }>("/api/admin/media/upload-url", {
    method: "POST",
    json: {
      quizId: opts.quizId,
      fileName: opts.fileName,
      contentType,
      size: blob.size,
      kind: opts.kind,
      variant: opts.variant ?? "original",
    },
  });
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase is not configured in this browser build.");
  const { error } = await supabase.storage.from(MEDIA_BUCKET).uploadToSignedUrl(path, token, blob, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

export function replaceExtension(name: string, ext: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.${ext}`;
}
