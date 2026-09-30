import { handle, json, playerCredentials } from "@/lib/api/server";
import { getGameService } from "@/lib/game/instance";
import { withSignedMedia } from "@/lib/storage";

/** The player's sanitized view: never includes the correct answer before it is revealed. */
export async function GET(request: Request) {
  return handle(async () => {
    const { playerId, token } = playerCredentials(request);
    return json(await withSignedMedia(await getGameService().getPlayerView(playerId, token)));
  });
}
