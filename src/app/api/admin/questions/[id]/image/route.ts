import { z } from "zod";
import { handle, json, readJson } from "@/lib/api/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { updateQuestionImage } from "@/lib/quiz/repository";

const bodySchema = z.object({
  mediaPath: z.string().min(1).max(500),
  originalMediaPath: z.string().min(1).max(500).nullable(),
});

/** Attach a generated silhouette (and its original) directly to a saved question. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdminApi();
    const id = z.uuid().parse((await params).id);
    await updateQuestionImage(id, await readJson(request, bodySchema));
    return json({ ok: true });
  });
}
