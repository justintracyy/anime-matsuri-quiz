import { handle, json } from "@/lib/api/server";
import { getGameService } from "@/lib/game/instance";

/** Public lobby info for the join page (no player data, no quiz content). */
export async function GET(_request: Request, { params }: { params: Promise<{ pin: string }> }) {
  return handle(async () => {
    const { pin } = await params;
    return json(await getGameService().getJoinInfo(pin));
  });
}
