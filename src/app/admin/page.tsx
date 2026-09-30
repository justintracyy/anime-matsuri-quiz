import type { Metadata } from "next";
import { QuizDashboard } from "@/components/admin/quiz-dashboard";
import { requireAdminPage } from "@/lib/auth/admin";
import { readServerEnv } from "@/lib/env";
import { listQuizzes } from "@/lib/quiz/repository";

export const metadata: Metadata = { title: "Quizzes" };
export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  // Layouts and pages render in parallel, so the page repeats the layout's guards.
  if (!readServerEnv().ok) return null;
  await requireAdminPage("/admin");
  const quizzes = await listQuizzes();
  return <QuizDashboard quizzes={quizzes} />;
}
