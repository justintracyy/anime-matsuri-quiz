import type { Cue, Tick } from "./cues";
import { bell, brass, cymbal, pluck, taiko, whoosh, woodblock, type Kit } from "./synth";

const JOIN_NOTES = [81, 83, 86, 88];

function strum(kit: Kit, out: AudioNode, t: number, notes: number[], gap: number, vel: number, decay: number) {
  notes.forEach((midi, i) => pluck(kit, out, t + i * gap, midi, vel, decay));
}

export function playCue(kit: Kit, out: AudioNode, cue: Cue, t: number) {
  switch (cue) {
    case "join":
      pluck(kit, out, t, JOIN_NOTES[Math.floor(Math.random() * JOIN_NOTES.length)], 0.22, 0.5);
      break;
    case "next":
      whoosh(kit, out, t, 0.4, 0.45);
      break;
    case "round":
      taiko(kit, out, t, 0.7);
      taiko(kit, out, t + 0.22, 0.6);
      strum(kit, out, t + 0.5, [74, 78, 81, 86], 0.06, 0.2, 1.2);
      break;
    case "go":
      taiko(kit, out, t, 0.5);
      strum(kit, out, t, [62, 66, 69, 74, 78], 0.035, 0.18, 0.8);
      break;
    case "pause":
      strum(kit, out, t, [74, 69], 0.12, 0.2, 0.5);
      break;
    case "resume":
      strum(kit, out, t, [69, 74], 0.12, 0.2, 0.5);
      break;
    case "timeUp":
      taiko(kit, out, t, 0.6);
      bell(kit, out, t, 196, 0.32, 2.6);
      break;
    case "reveal":
      strum(kit, out, t, [74, 78, 81, 86], 0.07, 0.22, 1);
      bell(kit, out, t + 0.3, 1175, 0.08, 1.2);
      break;
    case "leaderboard":
      for (let i = 0; i < 14; i++) taiko(kit, out, t + i * 0.07, 0.12 + i * 0.025);
      taiko(kit, out, t + 1, 0.7);
      cymbal(kit, out, t + 1, 0.1);
      break;
    case "champion": {
      const hit = t + 0.45;
      for (const offset of [0, 0.15, 0.3]) brass(kit, out, t + offset, 62, 0.12);
      brass(kit, out, hit, 69, 1.1);
      for (const midi of [66, 74]) brass(kit, out, hit, midi, 1.1, 0.08);
      taiko(kit, out, hit, 0.6);
      cymbal(kit, out, hit, 0.14, 2);
      strum(kit, out, t + 1, [74, 78, 81, 86, 90], 0.06, 0.15, 1.2);
      break;
    }
  }
}

export function playTick(kit: Kit, out: AudioNode, tick: Tick, t: number) {
  if (tick === "urgent") woodblock(kit, out, t, 1250, 0.5);
  else woodblock(kit, out, t, 880, 0.35);
}
