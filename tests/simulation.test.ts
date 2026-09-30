import { describe, expect, it } from "vitest";
import { runMemorySimulation } from "../scripts/simulation";

describe("50-player simulation", () => {
  it("plays a full game with 50 concurrent players", async () => {
    const report = await runMemorySimulation({ playerCount: 50, seed: 7 });
    expect(report.players).toBe(50);
    expect(report.rejectedOverflow).toBe(5);
    expect(report.answersSubmitted).toBeGreaterThan(150);
    expect(report.duplicatesRejected).toBeGreaterThan(0);
    expect(report.scoringMismatches).toEqual([]);
    expect(report.podium).toHaveLength(3);
    expect(report.champion).toBeTruthy();
    expect(report.checks.filter((c) => !c.ok)).toEqual([]);
  });

  it("is stable across seeds", async () => {
    for (const seed of [1, 2, 3]) {
      const report = await runMemorySimulation({ seed });
      expect(report.checks.filter((c) => !c.ok)).toEqual([]);
    }
  });
});
