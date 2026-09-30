import { handle, json, readJson } from "@/lib/api/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { createSignedUpload, uploadRequestSchema } from "@/lib/storage";

/**
 * Returns a short-lived signed upload URL. Files go straight from the browser to
 * Supabase Storage (bypassing Vercel's request-size limit); the bucket enforces
 * the MIME allow-list and 15 MB size cap server-side.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAdminApi();
    const body = await readJson(request, uploadRequestSchema);
    return json(await createSignedUpload(body));
  });
}
