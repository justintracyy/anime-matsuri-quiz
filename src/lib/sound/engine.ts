"use client";

import type { Cue, MusicTrack, Tick } from "./cues";
import { playCue, playTick } from "./effects";
import { LOBBY, THINK, type Track } from "./music";
import { createNoise, type Kit } from "./synth";

export interface SoundSettings {
  muted: boolean;
  /** 0–1 */
  music: number;
  /** 0–1 */
  effects: number;
}

export interface SoundState extends SoundSettings {
  /** The browser hasn't allowed audio yet; it needs a click or key press on this page first. */
  locked: boolean;
}

export const DEFAULT_SOUND_STATE: SoundState = { muted: false, music: 0.6, effects: 0.8, locked: true };

const STORAGE_KEY = "matsuri-sound";
const TRACKS: Record<MusicTrack, Track> = { lobby: LOBBY, think: THINK };
/** How far ahead notes are queued on the audio clock, and how often the queue is topped up. */
const LOOKAHEAD_SECONDS = 0.15;
const SCHEDULER_MS = 25;

interface Playback {
  track: MusicTrack;
  gain: GainNode;
  step: number;
  next: number;
  timer: number;
}

function level(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function loadSettings(): SoundSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<SoundSettings>;
    return {
      muted: typeof saved.muted === "boolean" ? saved.muted : DEFAULT_SOUND_STATE.muted,
      music: level(saved.music, DEFAULT_SOUND_STATE.music),
      effects: level(saved.effects, DEFAULT_SOUND_STATE.effects),
    };
  } catch {
    return DEFAULT_SOUND_STATE;
  }
}

class SoundEngine {
  private kit: Kit | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private playback: Playback | null = null;
  private wanted: MusicTrack | null = null;
  private wantedDelay = 0;
  private hurry = false;
  private lastJoin = 0;
  private state: SoundState;
  private listeners = new Set<() => void>();

  constructor() {
    this.state = { ...loadSettings(), locked: true };
    const unlock = () => this.unlock();
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  update(patch: Partial<SoundSettings>) {
    this.setState(patch);
    const { muted, music, effects } = this.state;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted, music, effects }));
    } catch {
      // Private mode: settings last for this page only.
    }
    this.applyVolumes();
  }

  toggleMute() {
    this.update({ muted: !this.state.muted });
  }

  /** Browsers only start audio after the user interacts with the page, so every click or key press tries. */
  unlock() {
    const kit = this.ensure(true);
    if (kit && kit.ctx.state !== "running") void kit.ctx.resume().catch(() => undefined);
  }

  async test() {
    const kit = this.ensure(true);
    if (!kit || !this.sfxBus) return;
    await kit.ctx.resume().catch(() => undefined);
    playCue(kit, this.sfxBus, "reveal", kit.ctx.currentTime + 0.02);
  }

  setMusic(track: MusicTrack | null, delaySeconds = 0) {
    this.wanted = track;
    this.wantedDelay = delaySeconds;
    this.syncMusic();
  }

  setHurry(hurry: boolean) {
    this.hurry = hurry;
  }

  play(cue: Cue) {
    const kit = this.running();
    if (!kit || !this.sfxBus) return;
    if (cue === "join") {
      const now = performance.now();
      if (now - this.lastJoin < 120) return;
      this.lastJoin = now;
    }
    playCue(kit, this.sfxBus, cue, kit.ctx.currentTime + 0.02);
  }

  tick(kind: Tick) {
    const kit = this.running();
    if (kit && this.sfxBus) playTick(kit, this.sfxBus, kind, kit.ctx.currentTime + 0.01);
  }

  private running(): Kit | null {
    const kit = this.ensure(false);
    return kit && kit.ctx.state === "running" ? kit : null;
  }

  /** Creates the audio graph once the page has had a user gesture (before that the browser refuses to start it). */
  private ensure(fromGesture: boolean): Kit | null {
    if (this.kit) return this.kit;
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (!fromGesture && activation && !activation.hasBeenActive) return null;
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;

    const ctx = new AudioCtor();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 4;
    compressor.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(compressor);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.kit = { ctx, noise: createNoise(ctx) };
    this.applyVolumes(true);
    ctx.addEventListener("statechange", () => this.syncLock());
    this.syncLock();
    return this.kit;
  }

  private syncLock() {
    const locked = this.kit?.ctx.state !== "running";
    if (locked !== this.state.locked) this.setState({ locked });
    if (!locked) this.syncMusic();
  }

  private applyVolumes(immediate = false) {
    if (!this.kit) return;
    const t = this.kit.ctx.currentTime;
    const set = (node: GainNode | null, value: number) => {
      if (!node) return;
      if (immediate) node.gain.value = value;
      else node.gain.setTargetAtTime(value, t, 0.05);
    };
    set(this.master, this.state.muted ? 0 : 1);
    set(this.musicBus, this.state.music * 0.75);
    set(this.sfxBus, this.state.effects);
  }

  private syncMusic() {
    const kit = this.running();
    if (!kit || !this.musicBus || this.playback?.track === this.wanted || (!this.playback && !this.wanted)) return;
    this.stopMusic(kit, this.wanted ? 0.6 : 0.3);
    if (!this.wanted) return;

    const gain = kit.ctx.createGain();
    gain.connect(this.musicBus);
    const start = kit.ctx.currentTime + 0.05 + this.wantedDelay;
    gain.gain.setValueAtTime(0, kit.ctx.currentTime);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(1, start + 0.8);
    const playback: Playback = { track: this.wanted, gain, step: 0, next: start, timer: 0 };
    playback.timer = window.setInterval(() => this.schedule(kit, playback), SCHEDULER_MS);
    this.playback = playback;
    this.wantedDelay = 0;
    this.schedule(kit, playback);
  }

  private schedule(kit: Kit, p: Playback) {
    const { ctx } = kit;
    const track = TRACKS[p.track];
    // After the tab was throttled, skip ahead rather than firing a burst of late notes.
    if (p.next < ctx.currentTime - 0.2) p.next = ctx.currentTime + 0.02;
    while (p.next < ctx.currentTime + LOOKAHEAD_SECONDS) {
      const stepSeconds = 60 / (track.bpm * (this.hurry && p.track === "think" ? 1.2 : 1)) / 4;
      track.play(kit, p.gain, p.step, p.next, stepSeconds, this.hurry);
      p.step = (p.step + 1) % track.steps;
      p.next += stepSeconds;
    }
  }

  private stopMusic({ ctx }: Kit, fadeSeconds: number) {
    const p = this.playback;
    if (!p) return;
    this.playback = null;
    window.clearInterval(p.timer);
    const t = ctx.currentTime;
    p.gain.gain.cancelScheduledValues(t);
    p.gain.gain.setValueAtTime(p.gain.gain.value, t);
    p.gain.gain.linearRampToValueAtTime(0, t + fadeSeconds);
    // Leave time for already-queued notes to ring out before detaching.
    window.setTimeout(() => p.gain.disconnect(), (fadeSeconds + 2) * 1000);
  }

  private setState(patch: Partial<SoundState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}

let engine: SoundEngine | null = null;

/** The host screen's sound engine (null during server rendering). */
export function getSoundEngine(): SoundEngine | null {
  if (typeof window === "undefined") return null;
  engine ??= new SoundEngine();
  return engine;
}

export function subscribeSound(listener: () => void): () => void {
  return getSoundEngine()?.subscribe(listener) ?? (() => undefined);
}

export function getSoundState(): SoundState {
  return getSoundEngine()?.getSnapshot() ?? DEFAULT_SOUND_STATE;
}

export function getServerSoundState(): SoundState {
  return DEFAULT_SOUND_STATE;
}
