import { z } from "zod";
import { handle, json, playerCredentials, readJson } from "@/lib/api/server";
import { getGameService } from "@/lib/game/instance";

const bodySchema = z.object({ questionId: z.uuid(), choiceId: z.uuid() });

/** Scores are computed here from server timestamps — the browser only sends its choice. */
export async function POST(request: Request) {
  return handle(async () => {
    const { playerId, token } = playerCredentials(request);
    const { questionId, choiceId } = await readJson(request, bodySchema);
    return json(await getGameService().submitAnswer(playerId, token, questionId, choiceId));
  });
}
