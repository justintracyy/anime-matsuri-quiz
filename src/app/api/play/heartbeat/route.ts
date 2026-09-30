import { z } from "zod";
import { handle, json } from "@/lib/api/server";
import { getGameService } from "@/lib/game/instance";

// Credentials travel in the body because navigator.sendBeacon cannot set headers.
const bodySchema = z.object({
  playerId: z.string().max(64),
  token: z.string().max(200),
  connected: z.boolean().default(true),
});

export async function POST(request: Request) {
  return handle(async () => {
    const body = bodySchema.parse(JSON.parse((await request.text()) || "{}"));
    return json(await getGameService().heartbeat(body.playerId, body.token, body.connected));
  });
}
