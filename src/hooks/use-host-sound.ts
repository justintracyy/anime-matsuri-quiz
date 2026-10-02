"use client";

import { useEffect, useRef } from "react";
import { QUESTION_TYPE_INFO } from "@/lib/constants";
import type { HostView } from "@/lib/game/types";
import { cueFor, MUSIC_DELAY, musicFor, tickFor, type StageSnapshot } from "@/lib/sound/cues";
import { getSoundEngine } from "@/lib/sound/engine";

/** Drives the host screen's background music and sound effects from the live game state. */
export function useHostSound(view: HostView | null, remainingMs: number) {
  const phase = view?.session.phase ?? null;
  const questionIndex = view?.session.questionIndex ?? -1;
  const question = view?.question ?? null;
  const isNewRound = !!question?.isNewRound;
  const hasAudio = !!question && (QUESTION_TYPE_INFO[question.type].needsAudio || !!question.audio);
  const playerCount = view?.activePlayerCount ?? 0;
  const secondsLeft = Math.ceil(remainingMs / 1000);

  const stage = useRef<StageSnapshot | null>(null);
  useEffect(() => {
    if (!phase) return;
    const next: StageSnapshot = { phase, questionIndex, isNewRound, hasAudio };
    const cue = cueFor(stage.current, next);
    stage.current = next;
    const engine = getSoundEngine();
    if (cue) engine?.play(cue);
    engine?.setMusic(musicFor(next), cue ? (MUSIC_DELAY[cue] ?? 0) : 0);
  }, [phase, questionIndex, isNewRound, hasAudio]);

  const players = useRef<number | null>(null);
  useEffect(() => {
    if (!phase) return;
    const before = players.current;
    players.current = playerCount;
    if (phase === "lobby" && before !== null && playerCount > before) getSoundEngine()?.play("join");
  }, [phase, playerCount]);

  const lastTick = useRef<string | null>(null);
  useEffect(() => {
    const kind = phase === "active" ? tickFor(secondsLeft) : null;
    const engine = getSoundEngine();
    engine?.setHurry(kind !== null);
    if (!kind) return;
    const id = `${questionIndex}:${secondsLeft}`;
    if (lastTick.current === id) return;
    lastTick.current = id;
    engine?.tick(kind);
  }, [phase, questionIndex, secondsLeft]);

  useEffect(() => () => getSoundEngine()?.setMusic(null), []);
}
