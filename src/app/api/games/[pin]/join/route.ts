import { z } from "zod";
import { handle, json, readJson } from "@/lib/api/server";
import { getGameService } from "@/lib/game/instance";

const bodySchema = z.object({
  nickname: z.string().max(100),
  deviceToken: z.string().min(16).max(200),
});

export async function POST(request: Request, { params }: { params: Promise<{ pin: string }> }) {
  return handle(async () => {
    const { pin } = await params;
    const { nickname, deviceToken } = await readJson(request, bodySchema);
    const result = await getGameService().joinGame(pin, nickname, deviceToken);
    return json(
      {
        playerId: result.player.id,
        nickname: result.player.nickname,
        sessionId: result.session.id,
        pin: result.session.pin,
        restored: result.restored,
      },
      { status: result.restored ? 200 : 201 },
    );
  });
}
