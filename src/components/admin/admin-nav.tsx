"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Download, LayoutDashboard, LogOut, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Quizzes", icon: LayoutDashboard },
  { href: "/admin/silhouettes", label: "Silhouette generator", icon: Wand2 },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <nav className="flex items-center gap-1" aria-label="Organizer">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? pathname === "/admin" || pathname.startsWith("/admin/quizzes") : pathname.startsWith(href);
        return (
          <Button key={href} asChild variant="ghost" size="sm" className={cn(active && "bg-blush")}>
            <Link href={href} aria-current={active ? "page" : undefined}>
              <Icon /> <span className="hidden sm:inline">{label}</span>
            </Link>
          </Button>
        );
      })}
      <Button asChild variant="ghost" size="sm">
        <a href="/api/template" download>
          <Download /> <span className="hidden md:inline">Excel template</span>
        </a>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          await apiFetch("/api/admin/login", { method: "DELETE" }).catch(() => undefined);
          router.replace("/login");
        }}
      >
        <LogOut /> <span className="hidden sm:inline">Sign out</span>
      </Button>
    </nav>
  );
}
