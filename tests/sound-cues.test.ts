import { describe, expect, it } from "vitest";
import { cueFor, musicFor, tickFor, type StageSnapshot } from "@/lib/sound/cues";

const stage = (phase: StageSnapshot["phase"], extra: Partial<StageSnapshot> = {}): StageSnapshot => ({
  phase,
  questionIndex: 0,
  isNewRound: false,
  hasAudio: false,
  ...extra,
});

describe("musicFor", () => {
  it("plays thinking music during a normal question", () => {
    expect(musicFor(stage("active"))).toBe("think");
  });

  it("stays silent while an opening-song question plays its clip", () => {
    expect(musicFor(stage("active", { hasAudio: true }))).toBeNull();
  });

  it("plays the lobby track between questions and silence when paused or time is up", () => {
    expect(musicFor(stage("lobby"))).toBe("lobby");
    expect(musicFor(stage("results"))).toBe("lobby");
    expect(musicFor(stage("leaderboard"))).toBe("lobby");
    expect(musicFor(stage("paused"))).toBeNull();
    expect(musicFor(stage("closed"))).toBeNull();
  });
});

describe("cueFor", () => {
  it("is quiet on first load so refreshing the host screen doesn't replay effects", () => {
    expect(cueFor(null, stage("results"))).toBeNull();
  });

  it("is quiet when nothing changed (e.g. a routine refresh)", () => {
    expect(cueFor(stage("active"), stage("active"))).toBeNull();
  });

  it("marks each step of a question", () => {
    expect(cueFor(stage("lobby"), stage("ready", { isNewRound: true }))).toBe("round");
    expect(cueFor(stage("leaderboard"), stage("ready", { questionIndex: 1 }))).toBe("next");
    expect(cueFor(stage("ready"), stage("active"))).toBe("go");
    expect(cueFor(stage("active"), stage("paused"))).toBe("pause");
    expect(cueFor(stage("paused"), stage("active"))).toBe("resume");
    expect(cueFor(stage("active"), stage("closed"))).toBe("timeUp");
    expect(cueFor(stage("closed"), stage("results"))).toBe("reveal");
    expect(cueFor(stage("results"), stage("leaderboard"))).toBe("leaderboard");
    expect(cueFor(stage("leaderboard"), stage("final"))).toBe("champion");
  });
});

describe("tickFor", () => {
  it("ticks only over the last five seconds, sharper for the final three", () => {
    expect(tickFor(6)).toBeNull();
    expect(tickFor(5)).toBe("tick");
    expect(tickFor(4)).toBe("tick");
    expect(tickFor(3)).toBe("urgent");
    expect(tickFor(1)).toBe("urgent");
    expect(tickFor(0)).toBeNull();
  });
});
