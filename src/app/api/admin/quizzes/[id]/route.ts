import { z } from "zod";
import { handle, json, readJson } from "@/lib/api/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { deleteQuiz, getQuizDetail, saveQuizContent, setQuizStatus } from "@/lib/quiz/repository";

type Ctx = { params: Promise<{ id: string }> };
const idSchema = z.uuid();

export async function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    await requireAdminApi();
    const id = idSchema.parse((await params).id);
    return json(await getQuizDetail(id));
  });
}

/** Save the whole quiz (rounds, questions, choices) atomically. Never changes publish status. */
export async function PUT(request: Request, { params }: Ctx) {
  return handle(async () => {
    await requireAdminApi();
    const id = idSchema.parse((await params).id);
    await saveQuizContent(id, await request.json());
    return json(await getQuizDetail(id));
  });
}

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    await requireAdminApi();
    const id = idSchema.parse((await params).id);
    const { status } = await readJson(request, z.object({ status: z.enum(["draft", "published", "archived"]) }));
    const result = await setQuizStatus(id, status);
    return json({ ok: true, status, warnings: result.warnings });
  });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    await requireAdminApi();
    await deleteQuiz(idSchema.parse((await params).id));
    return json({ ok: true });
  });
}
