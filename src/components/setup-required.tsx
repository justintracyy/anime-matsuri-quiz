import { AlertTriangle } from "lucide-react";

export function SetupRequired({ issues }: { issues: string[] }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="card-matsuri max-w-xl p-8">
        <h1 className="mb-2 flex items-center gap-2 font-serif text-2xl font-bold">
          <AlertTriangle className="size-6 text-gold" /> Setup required
        </h1>
        <p className="mb-4 text-muted-text">
          Some environment variables are missing or invalid. Copy <code className="rounded bg-blush px-1">.env.example</code> to{" "}
          <code className="rounded bg-blush px-1">.env.local</code> (or add them in Vercel → Settings → Environment Variables) and restart.
        </p>
        <ul className="space-y-1 rounded-xl bg-blush/60 p-4 font-mono text-sm text-plum-dark">
          {issues.map((i) => (
            <li key={i}>• {i}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
