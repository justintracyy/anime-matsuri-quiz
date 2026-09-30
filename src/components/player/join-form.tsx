"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Users } from "lucide-react";
import { EventLogo } from "@/components/brand/brand";
import { FestivalBackdrop, Spirit } from "@/components/brand/decorations";
import { FullPageSpinner, MessageScreen } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api/client";
import { NICKNAME_MAX_LENGTH } from "@/lib/constants";
import type { JoinInfo } from "@/lib/game/types";
import { cleanNickname } from "@/lib/nickname";
import { formatPin, isValidPin } from "@/lib/pin";
import { getDeviceToken, loadPlayer, savePlayer } from "@/lib/player-session";

const BLOCKED: Record<Exclude<JoinInfo["reason"], "ok">, { title: string; message: string }> = {
  full: { title: "This game is full", message: "All 50 spots are taken. Ask the host if a spot opens up, then try again." },
  started: { title: "The game has started", message: "Late joining is turned off for this game. Ask the host to allow late joins." },
  ended: { title: "This game has ended", message: "Thanks for playing! Ask the host for the PIN of the next game." },
  expired: { title: "This PIN has expired", message: "Game PINs expire after 12 hours. Ask the host for a new PIN." },
};

export function JoinForm({ pin }: { pin: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [existing] = useState(() => (isValidPin(pin) ? loadPlayer(pin) : null));
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [nickname, setNickname] = useState(existing?.nickname ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const reason = search.get("reason");

  const loadInfo = useCallback(async () => {
    try {
      const data = await apiFetch<JoinInfo>(`/api/games/${pin}`);
      setInfo(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e : new ApiError("INTERNAL", "Something went wrong.", 500));
    }
  }, [pin]);

  useEffect(() => {
    if (existing && reason !== "session") {
      router.replace(`/play/${pin}`);
      return;
    }
    if (!isValidPin(pin)) return;
    const id = window.setTimeout(() => void loadInfo(), 0);
    return () => window.clearTimeout(id);
  }, [existing, reason, pin, router, loadInfo]);

  const join = async (name: string) => {
    const clean = cleanNickname(name);
    if (!clean) {
      setFormError("Please enter a nickname.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setSuggestion(null);
    try {
      const token = getDeviceToken();
      const result = await apiFetch<{ playerId: string; nickname: string; sessionId: string; pin: string }>(`/api/games/${pin}/join`, {
        method: "POST",
        json: { nickname: clean, deviceToken: token },
      });
      savePlayer({ ...result, token, joinedAt: Date.now() });
      router.replace(`/play/${pin}`);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("INTERNAL", "Something went wrong.", 500);
      if (err.code === "NICKNAME_TAKEN") {
        setSuggestion((err.details as { suggestion?: string } | undefined)?.suggestion ?? null);
        setFormError(err.message);
      } else if (["ROOM_FULL", "GAME_STARTED", "SESSION_ENDED", "SESSION_EXPIRED", "PIN_NOT_FOUND"].includes(err.code)) {
        await loadInfo();
        setFormError(err.message);
      } else {
        setFormError(err.message);
      }
      setSubmitting(false);
    }
  };

  if (existing && reason !== "session") return <FullPageSpinner label="Restoring your session…" />;
  if (!isValidPin(pin)) {
    return <MessageScreen title="That PIN doesn't look right" message="Game PINs are six digits." action={{ label: "Enter a PIN", href: "/join" }} mood="wow" />;
  }
  if (loadError) {
    if (loadError.isNetwork) {
      return <MessageScreen title="Can't reach the game" message={loadError.message} action={{ label: "Try again", onClick: () => void loadInfo() }} mood="wow" />;
    }
    return <MessageScreen title="Game not found" message={loadError.message} action={{ label: "Enter a different PIN", href: "/join" }} mood="wow" />;
  }
  if (!info) return <FullPageSpinner label="Finding your game…" />;
  if (!info.joinable && info.reason !== "ok") {
    const b = BLOCKED[info.reason];
    return (
      <MessageScreen
        title={b.title}
        message={b.message}
        action={info.reason === "full" || info.reason === "started" ? { label: "Try again", onClick: () => void loadInfo() } : { label: "Enter a different PIN", href: "/join" }}
        mood="wow"
      />
    );
  }

  return (
    <main className="relative flex min-h-dvh flex-col px-5 pb-6 pt-8">
      <FestivalBackdrop petals={8} lanterns={false} />
      <div className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col">
        <EventLogo size="sm" className="justify-center" />
        <div className="mt-8 flex flex-1 flex-col justify-center">
          <div className="card-matsuri p-6">
            <div className="mb-5 text-center">
              <Spirit className="mx-auto mb-2 w-12 animate-spirit-float" />
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-lavender">Game PIN {formatPin(info.pin)}</p>
              <h1 className="mt-1 text-balance font-serif text-2xl font-bold">{info.quizTitle}</h1>
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-text">
                <Users className="size-4" /> {info.playerCount} / {info.maxPlayers} players
              </p>
              {reason === "session" && <p className="mt-2 text-sm font-semibold text-error">Your previous session expired. Please join again.</p>}
            </div>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void join(nickname);
              }}
            >
              <Label htmlFor="nickname">Your nickname</Label>
              <Input
                id="nickname"
                autoFocus
                autoComplete="nickname"
                autoCapitalize="words"
                enterKeyHint="go"
                maxLength={NICKNAME_MAX_LENGTH}
                placeholder="e.g. SakuraSpirit"
                value={nickname}
                aria-invalid={!!formError}
                aria-describedby={formError ? "nickname-error" : undefined}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setFormError(null);
                }}
                className="h-14 text-center text-xl font-bold"
              />
              {formError && (
                <div id="nickname-error" role="alert" className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">
                  {formError}
                  {suggestion && (
                    <Button type="button" size="sm" variant="outline" className="mt-2 w-full" onClick={() => {
                      setNickname(suggestion);
                      void join(suggestion);
                    }}>
                      Join as “{suggestion}”
                    </Button>
                  )}
                </div>
              )}
              <Button type="submit" size="xl" variant="sakura" className="mt-2 w-full" disabled={submitting || !cleanNickname(nickname)}>
                {submitting ? <Loader2 className="size-5 animate-spin" /> : null}
                Join Game
              </Button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
