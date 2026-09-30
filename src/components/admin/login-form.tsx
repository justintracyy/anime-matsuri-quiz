"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api/client";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
          await apiFetch("/api/admin/login", { method: "POST", json: { password } });
          router.replace(next);
          router.refresh();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Sign in failed.");
          setLoading(false);
        }
      }}
    >
      <Label htmlFor="password">Organizer password</Label>
      <Input
        id="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-invalid={!!error}
      />
      {error && (
        <p className="text-sm font-semibold text-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={loading || !password}>
        {loading ? <Loader2 className="animate-spin" /> : <LogIn />} Sign in
      </Button>
    </form>
  );
}
