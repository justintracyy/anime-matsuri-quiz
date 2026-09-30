"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api/client";

export function HostLiveButton({
  quizId,
  disabled,
  size = "default",
  className,
}: {
  quizId: string;
  disabled?: boolean;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="sakura"
      size={size}
      className={className}
      disabled={disabled || loading}
      title={disabled ? "Publish the quiz first" : undefined}
      onClick={async () => {
        setLoading(true);
        try {
          const { sessionId } = await apiFetch<{ sessionId: string }>(`/api/admin/quizzes/${quizId}/sessions`, { method: "POST", json: {} });
          router.push(`/host/${sessionId}`);
        } catch (e) {
          toast.error(e instanceof ApiError ? e.message : "Could not start a live game.");
          setLoading(false);
        }
      }}
    >
      {loading ? <Loader2 className="animate-spin" /> : <Radio />} Host Live Game
    </Button>
  );
}
