import { z } from "zod";
import { handle, json, readJson } from "@/lib/api/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { signPaths } from "@/lib/storage";

export async function POST(request: Request) {
  return handle(async () => {
    await requireAdminApi();
    const { paths } = await readJson(request, z.object({ paths: z.array(z.string().min(1).max(500)).max(500) }));
    return json({ urls: await signPaths(paths) });
  });
}
