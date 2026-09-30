import Link from "next/link";
import { EventLogo } from "@/components/brand/brand";
import { AdminNav } from "@/components/admin/admin-nav";
import { SetupRequired } from "@/components/setup-required";
import { requireAdminPage } from "@/lib/auth/admin";
import { readServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const env = readServerEnv();
  if (!env.ok) return <SetupRequired issues={env.issues} />;
  await requireAdminPage();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b-2 border-dusty-pink bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin" aria-label="Dashboard home">
            <EventLogo size="sm" />
          </Link>
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
