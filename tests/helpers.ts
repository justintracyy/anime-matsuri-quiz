import { randomUUID } from "node:crypto";
import { MemoryGameStore, type MemoryQuiz } from "@/lib/game/memory-store";
import { GameService } from "@/lib/game/service";
import type { ChoiceRecord, QuestionRecord } from "@/lib/game/types";
import type { QuestionType } from "@/lib/constants";

export const START = Date.parse("2026-09-30T18:00:00.000Z");

export class TestClock {
  constructor(public t = START) {}
  now = () => new Date(this.t);
  advance(ms: number) {
    this.t += ms;
  }
}

export interface QuestionSpec {
  type?: QuestionType;
  prompt?: string;
  timeLimitSeconds?: number;
  multiplier?: number;
  correct?: 0 | 1 | 2 | 3;
  roundId?: string;
  roundTitle?: string;
  roundPosition?: number;
}

export function makeQuestion(spec: QuestionSpec = {}): QuestionRecord {
  const choices: ChoiceRecord[] = (["A", "B", "C", "D"] as const).map((label, i) => ({
    id: randomUUID(),
    label,
    text: `Choice ${label}`,
    position: i,
  }));
  return {
    id: randomUUID(),
    round_id: spec.roundId ?? "round-1",
    round_title: spec.roundTitle ?? "Round 1",
    round_position: spec.roundPosition ?? 0,
    type: spec.type ?? "TRIVIA",
    prompt: spec.prompt ?? "Which spirit guards the shrine?",
    correct_choice_id: choices[spec.correct ?? 0].id,
    time_limit_seconds: spec.timeLimitSeconds ?? 20,
    base_points: 500,
    multiplier: spec.multiplier ?? 1,
    explanation: "Because the lanterns said so.",
    media_path: null,
    original_media_path: null,
    audio_path: null,
    audio_start_seconds: 0,
    audio_duration_seconds: null,
    allow_audio_replay: true,
    choices,
  };
}

export function makeQuiz(questions: QuestionRecord[] = [makeQuestion(), makeQuestion(), makeQuestion()], status: MemoryQuiz["status"] = "published"): MemoryQuiz {
  return { id: randomUUID(), title: "Sakura & Spirits Test Quiz", subtitle: "Test", status, questions };
}

export function setup(quiz: MemoryQuiz = makeQuiz()) {
  const clock = new TestClock();
  const store = new MemoryGameStore(clock.now);
  store.addQuiz(quiz);
  const service = new GameService({ store, now: clock.now });
  return { clock, store, service, quiz };
}

export function deviceToken(i: number | string): string {
  return `test-device-token-${i}-0123456789abcdef`;
}

export interface TestPlayer {
  playerId: string;
  token: string;
  nickname: string;
}

export async function joinPlayers(service: GameService, pin: string, count: number, offset = 0): Promise<TestPlayer[]> {
  const out: TestPlayer[] = [];
  for (let i = offset; i < offset + count; i++) {
    const token = deviceToken(i);
    const nickname = `Player ${i + 1}`;
    const { player } = await service.joinGame(pin, nickname, token);
    out.push({ playerId: player.id, token, nickname });
  }
  return out;
}

/** Host helper that always sends the current version, like the real host screen. */
export async function host(service: GameService, sessionId: string, action: Parameters<GameService["hostAction"]>[1]["action"], extra: Omit<Parameters<GameService["hostAction"]>[1], "action"> = {}) {
  const view = await service.getHostView(sessionId);
  return service.hostAction(sessionId, { action, expectedVersion: view.session.stateVersion, ...extra });
}

export function correctChoice(q: QuestionRecord): string {
  return q.correct_choice_id!;
}

export function wrongChoice(q: QuestionRecord): string {
  return q.choices.find((c) => c.id !== q.correct_choice_id)!.id;
}
