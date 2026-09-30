import "server-only";
import { z } from "zod";
import {
  AUDIO_EXTENSIONS,
  AUDIO_MIME_TYPES,
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  MEDIA_BUCKET,
} from "./constants";
import { GameError } from "./game/errors";
import type { QuestionView } from "./game/types";
import { getSupabaseAdmin } from "./supabase/admin";

const SIGNED_URL_SECONDS = 60 * 60 * 3;

export const uploadRequestSchema = z.object({
  quizId: z.uuid().nullable().optional(),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(100),
  size: z.number().int().positive(),
  kind: z.enum(["image", "audio"]),
  variant: z.enum(["original", "display", "silhouette", "blurred"]).default("original"),
});
export type UploadRequest = z.infer<typeof uploadRequestSchema>;

function extension(name: string): string {
  return (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();
}

export function validateUpload(req: UploadRequest): { ext: string } {
  const ext = extension(req.fileName);
  if (req.size > MAX_UPLOAD_BYTES) {
    throw new GameError("VALIDATION", `Files must be ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB or smaller.`);
  }
  if (req.kind === "image") {
    if (!(IMAGE_MIME_TYPES as readonly string[]).includes(req.contentType) || !(IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
      throw new GameError("VALIDATION", "Images must be PNG, JPG or WebP.");
    }
  } else if (
    !(AUDIO_MIME_TYPES as readonly string[]).includes(req.contentType) ||
    !(AUDIO_EXTENSIONS as readonly string[]).includes(ext)
  ) {
    throw new GameError("VALIDATION", "Audio must be MP3, WAV or OGG.");
  }
  return { ext };
}

export function buildStoragePath(req: UploadRequest, id: string): string {
  const { ext } = validateUpload(req);
  const base =
    req.fileName
      .replace(/\.[^.]+$/, "")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "media";
  const folder = req.quizId ? `quizzes/${req.quizId}` : "library";
  return `${folder}/${req.kind}/${id}-${req.variant}-${base}.${ext}`;
}

export async function createSignedUpload(req: UploadRequest) {
  const path = buildStoragePath(req, crypto.randomUUID());
  const { data, error } = await getSupabaseAdmin().storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`createSignedUploadUrl: ${error?.message}`);
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

export async function signPaths(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (unique.length === 0) return {};
  const { data, error } = await getSupabaseAdmin().storage.from(MEDIA_BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS);
  if (error || !data) {
    console.error("[storage] signing failed", error);
    return {};
  }
  const out: Record<string, string> = {};
  for (const item of data) if (item.path && item.signedUrl && !item.error) out[item.path] = item.signedUrl;
  return out;
}

/** Replace storage paths on a question view with signed URLs (null when the file is missing). */
export async function withSignedMedia<T extends { question: QuestionView | null }>(view: T): Promise<T> {
  const q = view.question;
  if (!q || (!q.image && !q.audio)) return view;
  const urls = await signPaths([q.image?.path, q.audio?.path]);
  return {
    ...view,
    question: {
      ...q,
      image: q.image ? { path: null, url: (q.image.path && urls[q.image.path]) || null } : null,
      audio: q.audio ? { ...q.audio, path: null, url: (q.audio.path && urls[q.audio.path]) || null } : null,
    },
  };
}
