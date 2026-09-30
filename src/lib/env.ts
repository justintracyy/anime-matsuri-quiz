import { z } from "zod";

/**
 * NEXT_PUBLIC_* variables must be referenced statically so Next.js can inline
 * them into the browser bundle.
 */
const publicSchema = z.object({
  // Keep only the origin so a pasted ".../rest/v1/" endpoint still works.
  NEXT_PUBLIC_SUPABASE_URL: z
    .url({ message: "must be your Supabase project URL, e.g. https://abc.supabase.co" })
    .transform((v) => new URL(v).origin),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, "must be the anon or publishable key from Supabase → Project Settings → API"),
  NEXT_PUBLIC_SITE_URL: z
    .union([z.url(), z.literal("")])
    .optional()
    .transform((v) => (v ? v.replace(/\/+$/, "") : undefined)),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, "must be the service-role or secret key from Supabase → Project Settings → API"),
  ADMIN_PASSWORD: z.string().min(8, "must be at least 8 characters"),
  ADMIN_SESSION_SECRET: z.string().min(32, "must be at least 32 random characters"),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema> & PublicEnv;

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  • ${i}`).join("\n")}`);
    this.name = "EnvError";
  }
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`);
}

export function readPublicEnv(): { ok: true; env: PublicEnv } | { ok: false; issues: string[] } {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  return parsed.success ? { ok: true, env: parsed.data } : { ok: false, issues: formatIssues(parsed.error) };
}

export function getPublicEnv(): PublicEnv {
  const result = readPublicEnv();
  if (!result.ok) throw new EnvError(result.issues);
  return result.env;
}

export function readServerEnv(): { ok: true; env: ServerEnv } | { ok: false; issues: string[] } {
  const pub = readPublicEnv();
  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
  });
  const issues = [...(pub.ok ? [] : pub.issues), ...(parsed.success ? [] : formatIssues(parsed.error))];
  if (!pub.ok || !parsed.success) return { ok: false, issues };
  return { ok: true, env: { ...pub.env, ...parsed.data } };
}

export function getServerEnv(): ServerEnv {
  const result = readServerEnv();
  if (!result.ok) throw new EnvError(result.issues);
  return result.env;
}
