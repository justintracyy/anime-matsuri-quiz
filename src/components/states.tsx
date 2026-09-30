import Link from "next/link";
import { Loader2 } from "lucide-react";
import { FestivalBackdrop, Spirit } from "@/components/brand/decorations";
import { Button } from "@/components/ui/button";

export function FullPageSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center" aria-busy="true">
      <Spirit className="w-16 animate-spirit-float" />
      <p className="flex items-center gap-2 font-semibold text-plum">
        <Loader2 className="size-4 animate-spin" /> {label}
      </p>
    </main>
  );
}

export function MessageScreen({
  title,
  message,
  action,
  mood = "happy",
}: {
  title: string;
  message: React.ReactNode;
  action?: { label: string; href?: string; onClick?: () => void };
  mood?: "happy" | "wow";
}) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-10 text-center">
      <FestivalBackdrop petals={6} lanterns={false} spirits={false} />
      <div className="card-matsuri relative z-10 flex w-full max-w-sm flex-col items-center gap-4 p-8">
        <Spirit className="w-16" mood={mood} />
        <h1 className="font-serif text-2xl font-bold">{title}</h1>
        <div className="text-muted-text">{message}</div>
        {action &&
          (action.href ? (
            <Button asChild variant="sakura" size="lg" className="w-full">
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : (
            <Button variant="sakura" size="lg" className="w-full" onClick={action.onClick}>
              {action.label}
            </Button>
          ))}
      </div>
    </main>
  );
}
