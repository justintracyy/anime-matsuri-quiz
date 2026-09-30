import { z } from "zod";
import { handle, json } from "@/lib/api/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { listQuestionsForPicker } from "@/lib/quiz/repository";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdminApi();
    const id = z.uuid().parse((await params).id);
    return json({ questions: await listQuestionsForPicker(id) });
  });
}
