import { cookies } from "next/headers";
import { z } from "zod";
import { handle, json, readJson } from "@/lib/api/server";
import { ADMIN_COOKIE, createAdminToken, verifyAdminPassword } from "@/lib/auth/admin";
import { GameError } from "@/lib/game/errors";
import { sleep } from "@/lib/utils";

export async function POST(request: Request) {
  return handle(async () => {
    const { password } = await readJson(request, z.object({ password: z.string().min(1).max(200) }));
    if (!verifyAdminPassword(password)) {
      await sleep(600);
      throw new GameError("UNAUTHORIZED", "That password is not correct.");
    }
    const token = createAdminToken();
    const store = await cookies();
    store.set(ADMIN_COOKIE, token.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: token.maxAge,
    });
    return json({ ok: true });
  });
}

export async function DELETE() {
  return handle(async () => {
    const store = await cookies();
    store.delete(ADMIN_COOKIE);
    return json({ ok: true });
  });
}
