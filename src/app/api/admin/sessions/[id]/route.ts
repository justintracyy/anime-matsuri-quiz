import { z } from "zod";
import { handle, json } from "@/lib/api/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { getGameService } from "@/lib/game/instance";
import { withSignedMedia } from "@/lib/storage";

/** Full host state. Everything is read from the database, so a host refresh restores the game. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdminApi();
    const id = z.uuid().parse((await params).id);
    return json(await withSignedMedia(await getGameService().getHostView(id)));
  });
}
