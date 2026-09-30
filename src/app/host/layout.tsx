import { SetupRequired } from "@/components/setup-required";
import { requireAdminPage } from "@/lib/auth/admin";
import { readServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function HostLayout({ children }: { children: React.ReactNode }) {
  const env = readServerEnv();
  if (!env.ok) return <SetupRequired issues={env.issues} />;
  await requireAdminPage();
  return children;
}
