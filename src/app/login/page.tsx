import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EventLogo } from "@/components/brand/brand";
import { FestivalBackdrop } from "@/components/brand/decorations";
import { SetupRequired } from "@/components/setup-required";
import { LoginForm } from "@/components/admin/login-form";
import { isAdmin } from "@/lib/auth/admin";
import { readServerEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Organizer sign in" };

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const env = readServerEnv();
  if (!env.ok) return <SetupRequired issues={env.issues} />;
  const next = safeNext((await searchParams).next);
  if (await isAdmin()) redirect(next);
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-5">
      <FestivalBackdrop petals={8} />
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6">
        <EventLogo />
        <div className="card-matsuri w-full p-6">
          <h1 className="mb-1 font-serif text-2xl font-bold">Organizer sign in</h1>
          <p className="mb-4 text-sm text-muted-text">Manage quizzes and host live games.</p>
          <LoginForm next={next} />
        </div>
      </div>
    </main>
  );
}
