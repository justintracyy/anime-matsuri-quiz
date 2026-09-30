import { z } from "zod";
import { handle, json } from "@/lib/api/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { getGameService } from "@/lib/game/instance";

const bodySchema = z
  .object({ allowLateJoin: z.boolean().optional(), mirrorToPlayers: z.boolean().optional() })
  .default({});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdminApi();
    const quizId = z.uuid().parse((await params).id);
    const raw = await request.text();
    const options = bodySchema.parse(raw ? JSON.parse(raw) : {});
    const session = await getGameService().createSession(quizId, options);
    return json({ sessionId: session.id, pin: session.game_pin }, { status: 201 });
  });
}
