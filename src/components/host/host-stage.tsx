"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Crown,
  Eye,
  FastForward,
  Flag,
  Keyboard,
  LayoutDashboard,
  Loader2,
  Maximize,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SkipForward,
  Square,
  Trophy,
  UserX,
  Users,
  Zap,
} from "lucide-react";
import { EventLogo } from "@/components/brand/brand";
import { FestivalBackdrop, Spirit } from "@/components/brand/decorations";
import { ChampionshipScreen } from "@/components/game/championship";
import { HostChoiceGrid } from "@/components/game/choice-display";
import { LiveDot } from "@/components/game/connection-banner";
import { Leaderboard } from "@/components/game/leaderboard";
import { AudioClipPlayer, QuestionImage } from "@/components/game/question-media";
import { TimerRing } from "@/components/game/timer-ring";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import type { RealtimeStatus } from "@/hooks/use-realtime";
import { MULTIPLIER_LABEL, PLAYER_STALE_MS, QUESTION_TYPE_INFO, type QuestionType } from "@/lib/constants";
import { PHASE_LABEL } from "@/lib/game/phases";
import type { HostAction } from "@/lib/game/service";
import type { GamePhase, HostView } from "@/lib/game/types";
import type { PreloadStatus } from "@/lib/media-cache";
import { buildJoinUrl, formatPin } from "@/lib/pin";
import { getSoundEngine } from "@/lib/sound/engine";
import { cn, formatPoints, formatSeconds } from "@/lib/utils";
import type { RunAction } from "./host-game";
import { SoundSettings, SoundToggle } from "./sound-controls";

type Confirm = { kind: "skip" } | { kind: "end" } | { kind: "restart" } | { kind: "remove"; playerId: string; nickname: string } | null;

function joinOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || window.location.origin;
}

export function HostStage({
  view,
  realtime,
  remainingMs,
  answerCount,
  busy,
  run,
  media,
}: {
  view: HostView;
  realtime: RealtimeStatus;
  remainingMs: number;
  answerCount: number;
  busy: HostAction | null;
  run: RunAction;
  media: PreloadStatus | null;
}) {
  const { session, question } = view;
  const phase = session.phase;
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isLast = session.questionIndex >= session.totalQuestions - 1;

  const primary: { action: HostAction; label: string; icon: React.ReactNode } | null = useMemo(() => {
    switch (phase) {
      case "lobby":
        return { action: "start_game", label: "Start game", icon: <Play /> };
      case "ready":
        return { action: "start_question", label: "Start question", icon: <Play /> };
      case "closed":
        return { action: "reveal", label: "Reveal answer", icon: <Eye /> };
      case "results":
        return { action: "show_leaderboard", label: "Show leaderboard", icon: <BarChart3 /> };
      case "leaderboard":
        return { action: "next_question", label: isLast ? "Show champion" : "Next question", icon: isLast ? <Trophy /> : <ArrowRight /> };
      default:
        return null;
    }
  }, [phase, isLast]);

  // Keyboard: Space / Enter / → triggers the primary action; P pauses/resumes; M mutes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (confirm || playersOpen || settingsOpen || target.closest("input, textarea, select, [role=dialog], button")) return;
      if ((e.key === " " || e.key === "Enter" || e.key === "ArrowRight") && primary && !busy) {
        e.preventDefault();
        void run(primary.action);
      } else if (e.key.toLowerCase() === "p" && !busy) {
        if (phase === "active") void run("pause");
        else if (phase === "paused") void run("resume");
      } else if (e.key.toLowerCase() === "m") {
        getSoundEngine()?.toggleMute();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [primary, busy, run, phase, confirm, playersOpen, settingsOpen]);

  if (phase === "final") {
    return (
      <div className="relative">
        <FestivalBackdrop petals={0} lanterns={false} spirits={false} />
        <ChampionshipScreen podium={view.podium} />
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
          <SoundToggle />
          <Button variant="outline" onClick={() => setConfirm({ kind: "restart" })}>
            <RotateCcw /> Restart game
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin">
              <LayoutDashboard /> Dashboard
            </Link>
          </Button>
        </div>
        <Confirmations confirm={confirm} setConfirm={setConfirm} run={run} />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col">
      <FestivalBackdrop petals={phase === "lobby" ? 16 : 8} lanterns={phase === "lobby" || phase === "leaderboard"} spirits={phase === "lobby"} />

      <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <EventLogo size="sm" />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="px-3 py-1 text-sm">
            PIN <span className="ml-1 font-serif text-base font-bold tracking-widest">{formatPin(session.pin)}</span>
          </Badge>
          <Badge variant="lavender" className="px-3 py-1 text-sm">{PHASE_LABEL[phase]}</Badge>
          <MediaBadge media={media} phase={phase} />
          <LiveDot status={realtime === "unavailable" ? "offline" : realtime} />
          <Button size="sm" variant="outline" onClick={() => setPlayersOpen(true)}>
            <Users /> {view.activePlayerCount} / {session.maxPlayers}
          </Button>
          <SoundToggle />
          <Button size="icon-sm" variant="outline" aria-label="Game settings" onClick={() => setSettingsOpen(true)}>
            <Settings2 />
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Toggle full screen"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined)}
          >
            <Maximize />
          </Button>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col px-5 pb-28">
        <AnimatePresence mode="wait">
          <motion.div key={`${phase}:${session.questionIndex}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="flex flex-1 flex-col">
            {phase === "lobby" && <Lobby view={view} onRemove={(p) => setConfirm({ kind: "remove", playerId: p.id, nickname: p.nickname })} />}
            {question && ["ready", "active", "paused", "closed", "results"].includes(phase) && (
              <QuestionStage view={view} remainingMs={remainingMs} answerCount={answerCount} />
            )}
            {phase === "leaderboard" && (
              <div className="flex flex-1 flex-col items-center justify-center py-6">
                <Leaderboard entries={view.leaderboard} title={isLast ? "Final standings" : "Top 5"} />
                {!isLast && view.nextQuestion && (
                  <p className="mt-6 text-sm font-semibold text-muted-text">
                    Up next: Question {view.nextQuestion.index + 1} · {QUESTION_TYPE_INFO[view.nextQuestion.type].label}
                  </p>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-dusty-pink bg-white/95 px-4 py-3 backdrop-blur" aria-label="Host controls">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          {phase === "active" && (
            <Button variant="outline" onClick={() => void run("pause")} disabled={!!busy}>
              <Pause /> Pause timer
            </Button>
          )}
          {phase === "paused" && (
            <Button variant="sakura" onClick={() => void run("resume")} disabled={!!busy}>
              <Play /> Resume timer
            </Button>
          )}
          {(phase === "active" || phase === "paused") && (
            <Button variant="outline" onClick={() => void run("end_question")} disabled={!!busy}>
              <Square /> End question early
            </Button>
          )}
          {["ready", "active", "paused", "closed"].includes(phase) && (
            <Button variant="ghost" onClick={() => setConfirm({ kind: "skip" })} disabled={!!busy}>
              <SkipForward /> Skip question
            </Button>
          )}
          {phase === "results" && (
            <Button variant="outline" onClick={() => void run("next_question")} disabled={!!busy}>
              <FastForward /> {isLast ? "Skip to champion" : "Next question"}
            </Button>
          )}
          <span className="hidden items-center gap-1 text-xs text-muted-text lg:inline-flex">
            <Keyboard className="size-3.5" /> Space = next step · P = pause · M = mute
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {phase !== "lobby" && (
              <Button variant="ghost" onClick={() => setConfirm({ kind: "restart" })} disabled={!!busy}>
                <RotateCcw /> Restart
              </Button>
            )}
            <Button variant="ghost" className="text-error" onClick={() => setConfirm({ kind: "end" })} disabled={!!busy}>
              <Flag /> End game
            </Button>
            {primary && (
              <Button size="lg" variant={phase === "closed" ? "gold" : "default"} onClick={() => void run(primary.action)} disabled={!!busy || (phase === "lobby" && view.activePlayerCount === 0)}>
                {busy === primary.action ? <Loader2 className="animate-spin" /> : primary.icon} {primary.label}
              </Button>
            )}
          </div>
        </div>
      </footer>

      <PlayersDialog open={playersOpen} onOpenChange={setPlayersOpen} view={view} onRemove={(p) => setConfirm({ kind: "remove", playerId: p.id, nickname: p.nickname })} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} view={view} run={run} />
      <Confirmations confirm={confirm} setConfirm={setConfirm} run={run} />
    </div>
  );
}

function MediaBadge({ media, phase }: { media: PreloadStatus | null; phase: GamePhase }) {
  if (!media || media.total === 0) return null;
  if (media.done + media.failed < media.total) {
    return (
      <Badge variant="outline" className="gap-1.5 px-3 py-1 text-sm" title="Downloading songs and pictures to this screen so questions start instantly">
        <Loader2 className="size-3.5 animate-spin" /> Loading media {media.done}/{media.total}
      </Badge>
    );
  }
  if (media.failed > 0) {
    return (
      <Badge variant="gold" className="px-3 py-1 text-sm" title="These files will load when their question starts">
        {media.failed} file{media.failed === 1 ? "" : "s"} will stream live
      </Badge>
    );
  }
  if (phase !== "lobby") return null;
  return (
    <Badge variant="success" className="gap-1.5 px-3 py-1 text-sm">
      <CheckCircle2 className="size-3.5" /> Media ready {media.done}/{media.total}
    </Badge>
  );
}

function Confirmations({ confirm, setConfirm, run }: { confirm: Confirm; setConfirm: (c: Confirm) => void; run: RunAction }) {
  const close = (o: boolean) => !o && setConfirm(null);
  return (
    <>
      <ConfirmDialog
        open={confirm?.kind === "skip"}
        onOpenChange={close}
        title="Skip this question?"
        description="No points are awarded for a skipped question and it can't be replayed in this game."
        confirmLabel="Skip question"
        onConfirm={() => void run("skip_question")}
      />
      <ConfirmDialog
        open={confirm?.kind === "end"}
        onOpenChange={close}
        title="End the game now?"
        description="Players will see their final results and the championship screen. Unrevealed questions won't be scored."
        confirmLabel="End game"
        destructive
        onConfirm={() => void run("end_game")}
      />
      <ConfirmDialog
        open={confirm?.kind === "restart"}
        onOpenChange={close}
        title="Restart the game?"
        description="All scores and answers are cleared and everyone returns to the lobby. Players stay connected."
        confirmLabel="Restart game"
        destructive
        onConfirm={() => void run("restart_game")}
      />
      <ConfirmDialog
        open={confirm?.kind === "remove"}
        onOpenChange={close}
        title={`Remove ${confirm?.kind === "remove" ? confirm.nickname : "player"}?`}
        description="They will be disconnected from this game and can't rejoin from the same device."
        confirmLabel="Remove player"
        destructive
        onConfirm={() => confirm?.kind === "remove" && void run("remove_player", { playerId: confirm.playerId })}
      />
    </>
  );
}

function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function isOnline(p: HostView["players"][number], now: number) {
  return p.connected && now - Date.parse(p.last_seen_at) < PLAYER_STALE_MS;
}

function Lobby({ view, onRemove }: { view: HostView; onRemove: (p: { id: string; nickname: string }) => void }) {
  const [origin] = useState(joinOrigin);
  const now = useNow();
  const url = buildJoinUrl(origin, view.session.pin);
  const players = view.players.filter((p) => !p.kicked);
  const pct = (players.length / view.session.maxPlayers) * 100;
  return (
    <div className="grid flex-1 items-center gap-8 py-4 lg:grid-cols-[auto_1fr]">
      <div className="card-matsuri mx-auto flex flex-col items-center gap-4 p-6 md:p-8">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lavender">Scan to join</p>
        <div className="rounded-2xl border-4 border-sakura-light bg-white p-3">
          <QRCodeSVG value={url} size={280} level="M" fgColor="#4B3D4F" marginSize={1} title={`Join at ${url}`} />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-muted-text">or enter the game PIN</p>
          <p className="font-serif text-6xl font-extrabold tracking-[0.12em] text-plum-dark md:text-7xl">{formatPin(view.session.pin)}</p>
          <p className="mt-1 break-all text-xs text-muted-text">{url}</p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-sakura">{view.quiz.subtitle ?? "Anime Matsuri Guessing Game"}</p>
          <h1 className="text-balance font-serif text-4xl font-bold md:text-6xl">{view.quiz.title}</h1>
        </div>
        <div className="card-matsuri p-5">
          <div className="mb-3 flex items-end justify-between">
            <p className="flex items-center gap-2 font-serif text-3xl font-bold">
              <Users className="size-7 text-sakura" /> {players.length} <span className="text-xl text-muted-text">/ {view.session.maxPlayers}</span>
            </p>
            <p className="text-sm font-semibold text-muted-text">{players.length >= view.session.maxPlayers ? "Room full" : "players connected"}</p>
          </div>
          <Progress value={pct} indicatorClassName={pct >= 100 ? "bg-gold" : undefined} aria-label="Room capacity" />
          <ul className="mt-5 flex max-h-[42dvh] flex-wrap gap-2 overflow-auto" aria-live="polite" aria-label="Players in the lobby">
            <AnimatePresence>
              {players.map((p) => (
                <motion.li key={p.id} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}>
                  <button
                    type="button"
                    onClick={() => onRemove(p)}
                    title="Remove player"
                    className={cn(
                      "group flex items-center gap-2 rounded-full border-2 border-dusty-pink bg-white px-4 py-1.5 text-lg font-bold text-plum-dark shadow-sm transition hover:border-error",
                      !isOnline(p, now) && "opacity-50",
                    )}
                  >
                    <span className={cn("size-2 rounded-full", isOnline(p, now) ? "bg-emerald-500" : "bg-muted-text")} />
                    {p.nickname}
                    <UserX className="size-4 text-error opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
            {players.length === 0 && (
              <li className="flex w-full flex-col items-center gap-2 py-6 text-muted-text">
                <Spirit className="w-14 animate-spirit-float" />
                Waiting for players to scan the QR code…
              </li>
            )}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {view.session.allowLateJoin && <Badge variant="sakura">Late joining on</Badge>}
          {view.session.mirrorToPlayers && <Badge variant="lavender">Questions mirrored to phones</Badge>}
        </div>
      </div>
    </div>
  );
}

function QuestionStage({ view, remainingMs, answerCount }: { view: HostView; remainingMs: number; answerCount: number }) {
  const { session, question, results } = view;
  const q = question!;
  const phase = session.phase;
  const type = q.type as QuestionType;
  const info = QUESTION_TYPE_INFO[type];
  const live = phase === "active" || phase === "paused";
  const revealed = phase === "results";
  const pct = view.activePlayerCount ? (answerCount / view.activePlayerCount) * 100 : 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-sakura">
            Question {session.questionIndex + 1} of {session.totalQuestions} · {q.roundTitle}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="lavender">{info.label}</Badge>
            {q.multiplier > 1 && <Badge variant="gold" className="uppercase tracking-wider">{MULTIPLIER_LABEL[q.multiplier]}</Badge>}
          </div>
        </div>
        {(live || phase === "closed") && (
          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="font-serif text-4xl font-bold tabular-nums text-plum-dark">
                {answerCount}
                <span className="text-xl text-muted-text"> / {view.activePlayerCount}</span>
              </p>
              <p className="text-sm font-semibold text-muted-text">answered</p>
              <Progress value={pct} className="mt-1 h-2 w-36" aria-label="Players answered" />
            </div>
            {live ? (
              <TimerRing remainingMs={remainingMs} totalMs={q.timeLimitSeconds * 1000} paused={phase === "paused"} size={112} />
            ) : (
              <div className="flex size-28 items-center justify-center rounded-full bg-plum text-center font-serif text-lg font-bold leading-tight text-white">Time’s up!</div>
            )}
          </div>
        )}
      </div>

      {phase === "ready" && q.isNewRound && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-auto rounded-full border-2 border-gold bg-white px-8 py-2 text-center shadow-[var(--shadow-gold)]">
          <p className="font-serif text-2xl font-bold text-plum-dark">{q.roundTitle}</p>
          {q.multiplier > 1 && <p className="text-sm font-bold uppercase tracking-widest text-gold">{MULTIPLIER_LABEL[q.multiplier]}</p>}
        </motion.div>
      )}

      <h1
        className={cn(
          "text-balance text-center font-serif font-bold text-plum-dark",
          type === "EMOJI" ? "text-7xl leading-tight md:text-8xl" : "text-3xl md:text-5xl",
        )}
      >
        {type === "QUOTE" ? (
          <span className="relative inline-block px-8">
            <span className="absolute -left-1 -top-4 font-serif text-7xl text-sakura" aria-hidden="true">“</span>
            <span className="italic">{q.prompt.replace(/^["“]|["”]$/g, "")}</span>
            <span className="absolute -bottom-10 -right-1 font-serif text-7xl text-sakura" aria-hidden="true">”</span>
          </span>
        ) : (
          q.prompt
        )}
      </h1>

      {phase === "ready" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Spirit className="w-20 animate-spirit-float" mood="wow" />
          <p className="text-xl font-semibold text-plum">Get ready! Players, pick up your phones.</p>
          <p className="text-sm text-muted-text">{q.timeLimitSeconds} seconds to answer · press Start question when everyone is ready</p>
        </div>
      ) : (
        <>
          {(info.needsImage || q.image) && (
            <div className={cn("flex justify-center", revealed ? "max-h-[32dvh]" : "max-h-[40dvh]")}>
              <QuestionImage
                image={q.image}
                alt={revealed ? "Revealed image" : "Question image"}
                expectImage={info.needsImage}
                className={cn("max-h-[40dvh] border-4 border-white shadow-[var(--shadow-soft)]", revealed && "max-h-[32dvh]", type === "SILHOUETTE" && !revealed && "bg-white p-2")}
              />
            </div>
          )}
          {(info.needsAudio || q.audio) && q.audio && (
            <div className="mx-auto w-full max-w-xl">
              <AudioClipPlayer audio={q.audio} autoPlay={phase === "active"} stopSignal={phase !== "active" ? phase : null} />
            </div>
          )}
          {info.needsAudio && !q.audio && (
            <p className="mx-auto rounded-2xl bg-gold/10 px-4 py-2 text-sm font-semibold text-[#7a4f22]">Audio is missing for this question — read the prompt aloud or skip it.</p>
          )}
          <HostChoiceGrid
            choices={q.choices}
            correctChoiceId={revealed ? (results?.correctChoiceId ?? q.correctChoiceId) : null}
            distribution={revealed ? results?.distribution : undefined}
            totalAnswers={results?.answeredCount}
          />
          {revealed && results && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="grid gap-3 md:grid-cols-3">
              <div className="card-matsuri flex items-center gap-3 p-4">
                <Crown className="size-8 shrink-0 text-gold" />
                <div>
                  <p className="font-serif text-2xl font-bold">
                    {results.correctCount} / {results.answeredCount}
                  </p>
                  <p className="text-sm text-muted-text">answered correctly</p>
                </div>
              </div>
              <div className="card-matsuri flex items-center gap-3 p-4">
                <Zap className="size-8 shrink-0 text-sakura" />
                <div className="min-w-0">
                  {results.fastest ? (
                    <>
                      <p className="truncate font-serif text-2xl font-bold">{results.fastest.nickname}</p>
                      <p className="text-sm text-muted-text">fastest correct answer · {formatSeconds(results.fastest.responseTimeMs)}</p>
                    </>
                  ) : (
                    <p className="text-muted-text">Nobody got this one!</p>
                  )}
                </div>
              </div>
              {q.explanation ? (
                <div className="card-matsuri p-4 text-sm text-plum-dark md:col-span-1">{q.explanation}</div>
              ) : (
                <div className="card-matsuri flex items-center gap-3 p-4">
                  <Trophy className="size-8 shrink-0 text-lavender" />
                  <p className="text-sm text-muted-text">
                    Leader: <span className="font-bold text-plum-dark">{view.leaderboard[0]?.nickname ?? "—"}</span> · {formatPoints(view.leaderboard[0]?.score ?? 0)} pts
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

function PlayersDialog({
  open,
  onOpenChange,
  view,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  view: HostView;
  onRemove: (p: { id: string; nickname: string }) => void;
}) {
  const now = useNow();
  const players = [...view.players].filter((p) => !p.kicked).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Players ({players.length} / {view.session.maxPlayers})
          </DialogTitle>
          <DialogDescription>Individual answers stay hidden during the timer. Removing a player requires confirmation.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-[60dvh] divide-y divide-dusty-pink/60 overflow-auto">
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <span className="w-8 text-center font-serif font-bold text-muted-text">{p.rank ?? "—"}</span>
              <span className={cn("size-2.5 rounded-full", isOnline(p, now) ? "bg-emerald-500" : "bg-muted-text")} title={isOnline(p, now) ? "Connected" : "Disconnected"} />
              <span className="min-w-0 flex-1 truncate font-semibold">{p.nickname}</span>
              <span className="tabular-nums text-plum">{formatPoints(p.score)}</span>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove ${p.nickname}`} onClick={() => onRemove(p)}>
                <UserX className="text-error" />
              </Button>
            </li>
          ))}
          {players.length === 0 && <li className="py-6 text-center text-muted-text">No players yet.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({ open, onOpenChange, view, run }: { open: boolean; onOpenChange: (o: boolean) => void; view: HostView; run: RunAction }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Game settings</DialogTitle>
          <DialogDescription>Changes apply immediately to every connected device.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="late-join">Allow late joining</Label>
              <p className="text-sm text-muted-text">Let new players join after the game has started (still capped at {view.session.maxPlayers}).</p>
            </div>
            <Switch id="late-join" checked={view.session.allowLateJoin} onCheckedChange={(v) => void run("update_settings", { settings: { allowLateJoin: v } })} />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="mirror">Mirror questions to phones</Label>
              <p className="text-sm text-muted-text">Show the question text, image and audio on player devices as well as the host screen.</p>
            </div>
            <Switch id="mirror" checked={view.session.mirrorToPlayers} onCheckedChange={(v) => void run("update_settings", { settings: { mirrorToPlayers: v } })} />
          </div>
          <SoundSettings />
        </div>
      </DialogContent>
    </Dialog>
  );
}
