import { z } from "zod";
import { handle, json } from "@/lib/api/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { getGameService } from "@/lib/game/instance";
import { mediaKey, signPaths } from "@/lib/storage";

/** Signed links to every file in the game so the host screen can download them while players join. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdminApi();
    const id = z.uuid().parse((await params).id);
    const media = await getGameService().getSessionMedia(id);
    const urls = await signPaths(media.map((m) => m.path));
    return json({
      items: media.filter((m) => urls[m.path]).map((m) => ({ kind: m.kind, key: mediaKey(m.path), url: urls[m.path] })),
    });
  });
}
