import { bass, hat, kick, pad, pluck, shaker, taiko, woodblock, type Kit } from "./synth";

export interface Track {
  bpm: number;
  /** Loop length in sixteenth notes. */
  steps: number;
  /** Schedule everything that starts on `step` at audio time `t`. */
  play(kit: Kit, out: AudioNode, step: number, t: number, stepSeconds: number, hurry: boolean): void;
}

function notesByStep(pairs: [step: number, midi: number][]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const [step, midi] of pairs) map.set(step, [...(map.get(step) ?? []), midi]);
  return map;
}

// Lobby / between questions: festival groove in D major pentatonic (the Japanese
// "yo" scale, D E F# A B) over D – Bm – G – A. Bars 1–4 carry the koto melody,
// bars 5–8 swap it for arpeggios so the loop doesn't wear thin.
const LOBBY_CHORDS = [
  [62, 66, 69],
  [59, 62, 66],
  [59, 62, 67],
  [61, 64, 69],
];
const LOBBY_ROOTS = [50, 47, 43, 45];
const LOBBY_MELODY = notesByStep([
  [0, 74], [3, 71], [6, 69], [8, 66], [10, 69], [12, 71],
  [16, 74], [19, 76], [22, 74], [24, 71], [28, 69],
  [32, 71], [35, 69], [38, 66], [40, 64], [42, 66], [44, 69],
  [48, 69], [50, 71], [52, 74], [56, 76], [59, 74], [62, 71],
]);
const ARPEGGIO = [0, 1, 2, 1];

export const LOBBY: Track = {
  bpm: 96,
  steps: 128,
  play(kit, out, step, t, stepSeconds) {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const root = LOBBY_ROOTS[bar];
    if (s === 0) {
      pad(kit, out, t, LOBBY_CHORDS[bar], stepSeconds * 16, 0.025);
      bass(kit, out, t, root, 0.18);
      taiko(kit, out, t, 0.45);
    }
    if (s === 6) bass(kit, out, t, root, 0.1);
    if (s === 8) {
      bass(kit, out, t, root + 7, 0.14);
      taiko(kit, out, t, 0.28);
    }
    if (s === 14) bass(kit, out, t, root, 0.09);
    if (s === 12) woodblock(kit, out, t, 1400, 0.08);
    if (s % 4 === 2) shaker(kit, out, t, 0.04);
    if (step < 64) {
      for (const midi of LOBBY_MELODY.get(step) ?? []) pluck(kit, out, t, midi, 0.2);
    } else if (s % 2 === 0) {
      pluck(kit, out, t, LOBBY_CHORDS[bar][ARPEGGIO[(s / 2) % 4]] + 12, 0.1, 0.6);
    }
  },
};

// Question timer: driving E Phrygian ("in" scale flavour, E F A B C) with the
// F bar for tension. `hurry` (last five seconds) adds sixteenth-note hats.
const THINK_ROOTS = [40, 40, 41, 40];
const THINK_ARPEGGIO = [
  [64, 71, 76, 71],
  [64, 71, 76, 71],
  [65, 72, 77, 72],
  [64, 71, 76, 71],
];
const THINK_LEAD = notesByStep([
  [0, 76], [6, 77], [8, 76], [12, 71],
  [32, 77], [38, 76], [40, 72], [44, 71], [48, 69], [52, 71], [56, 72], [60, 71],
]);

export const THINK: Track = {
  bpm: 124,
  steps: 64,
  play(kit, out, step, t, _stepSeconds, hurry) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    if (s % 2 === 0) {
      bass(kit, out, t, THINK_ROOTS[bar], s % 4 === 0 ? 0.16 : 0.1, 0.16);
      pluck(kit, out, t, THINK_ARPEGGIO[bar][(s / 2) % 4], 0.09, 0.3);
    }
    if (s % 4 === 0) kick(kit, out, t, 0.35);
    if (s % 4 === 2) hat(kit, out, t, 0.06);
    if (hurry || s % 2 === 1) hat(kit, out, t, hurry ? 0.035 : 0.02, 0.025);
    if (s === 12 && bar % 2 === 1) taiko(kit, out, t, 0.25);
    for (const midi of THINK_LEAD.get(step) ?? []) pluck(kit, out, t, midi, 0.12, 0.5);
  },
};
