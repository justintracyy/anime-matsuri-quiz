import { z } from "zod";
import { handle, json, readJson } from "@/lib/api/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { getGameService } from "@/lib/game/instance";
import { hostActionSchema } from "@/lib/game/service";
import { withSignedMedia } from "@/lib/storage";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdminApi();
    const id = z.uuid().parse((await params).id);
    const input = await readJson(request, hostActionSchema);
    const service = getGameService();
    await service.hostAction(id, input);
    return json(await withSignedMedia(await service.getHostView(id)));
  });
}
