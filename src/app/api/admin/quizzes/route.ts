import { handle, json } from "@/lib/api/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { createQuiz, listQuizzes } from "@/lib/quiz/repository";

export async function GET() {
  return handle(async () => {
    await requireAdminApi();
    return json({ quizzes: await listQuizzes() });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    await requireAdminApi();
    return json(await createQuiz(await request.json()), { status: 201 });
  });
}
