import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuizEditor } from "@/components/admin/quiz-editor";
import { requireAdminPage } from "@/lib/auth/admin";
import { readServerEnv } from "@/lib/env";
import { GameError } from "@/lib/game/errors";
import { getQuizDetail } from "@/lib/quiz/repository";

export const metadata: Metadata = { title: "Edit quiz" };
export const dynamic = "force-dynamic";

export default async function EditQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Layouts and pages render in parallel, so the page repeats the layout's guards.
  if (!readServerEnv().ok) return null;
  await requireAdminPage(`/admin/quizzes/${id}`);
  const detail = await getQuizDetail(id).catch((e: unknown) => {
    if (e instanceof GameError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  return <QuizEditor initial={detail} />;
}
