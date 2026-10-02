import { describe, expect, it } from "vitest";
import type { QuestionView } from "@/lib/game/types";
import { forgetMediaUrl, withStableMedia } from "@/lib/media-cache";
import { makeQuestion, makeQuiz, setup } from "./helpers";

function viewWith(image: { key: string; url: string } | null, audio: { key: string; url: string } | null) {
  const question = {
    id: "q1",
    image: image && { path: null, ...image },
    audio: audio && { path: null, ...audio, startSeconds: 0, durationSeconds: 15, allowReplay: true },
  } as unknown as QuestionView;
  return { question };
}

describe("withStableMedia", () => {
  it("keeps the first URL for a file even though every refresh re-signs it", () => {
    const first = withStableMedia(viewWith({ key: "img-a", url: "https://x/img-a?token=1" }, { key: "song-a", url: "https://x/song-a?token=1" }));
    const refreshed = withStableMedia(viewWith({ key: "img-a", url: "https://x/img-a?token=2" }, { key: "song-a", url: "https://x/song-a?token=2" }));
    expect(first.question?.audio?.url).toBe("https://x/song-a?token=1");
    expect(refreshed.question?.audio?.url).toBe("https://x/song-a?token=1");
    expect(refreshed.question?.image?.url).toBe("https://x/img-a?token=1");
  });

  it("switches when the file itself changes (e.g. silhouette → revealed original)", () => {
    withStableMedia(viewWith({ key: "silhouette-b", url: "https://x/silhouette-b?token=1" }, null));
    const revealed = withStableMedia(viewWith({ key: "original-b", url: "https://x/original-b?token=1" }, null));
    expect(revealed.question?.image?.url).toBe("https://x/original-b?token=1");
  });

  it("takes a fresh link after the pinned one failed to load", () => {
    withStableMedia(viewWith(null, { key: "song-c", url: "https://x/song-c?token=1" }));
    forgetMediaUrl("https://x/song-c?token=1");
    const next = withStableMedia(viewWith(null, { key: "song-c", url: "https://x/song-c?token=2" }));
    expect(next.question?.audio?.url).toBe("https://x/song-c?token=2");
  });

  it("leaves views without media untouched", () => {
    const view = { question: null };
    expect(withStableMedia(view)).toBe(view);
  });
});

describe("getSessionMedia", () => {
  it("lists every file once, in play order, including revealed originals", async () => {
    const song = { ...makeQuestion({ type: "OPENING_AUDIO" }), audio_path: "quizzes/q/audio/song.mp3" };
    const silhouette = {
      ...makeQuestion({ type: "SILHOUETTE" }),
      media_path: "quizzes/q/image/pika-silhouette.png",
      original_media_path: "quizzes/q/image/pika-original.png",
    };
    const reused = { ...makeQuestion({ type: "OPENING_AUDIO" }), audio_path: "quizzes/q/audio/song.mp3" };
    const { service, quiz } = setup(makeQuiz([song, makeQuestion(), silhouette, reused]));
    const session = await service.createSession(quiz.id);

    expect(await service.getSessionMedia(session.id)).toEqual([
      { kind: "audio", path: "quizzes/q/audio/song.mp3" },
      { kind: "image", path: "quizzes/q/image/pika-silhouette.png" },
      { kind: "image", path: "quizzes/q/image/pika-original.png" },
    ]);
  });
});
