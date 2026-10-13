import { z } from "zod";

/**
 * Public Supabase settings. Both values are safe to expose to the browser
 * (access is enforced by Row Level Security). The service-role key is a
 * different thing and is read only in src/server/db/admin-client.ts.
 *
 * NEXT_PUBLIC_* variables are inlined into client bundles by literal
 * `process.env.NEXT_PUBLIC_X` reads, so they are listed explicitly below
 * instead of iterating over process.env.
 */
export interface SupabasePublicEnv {
  url: string;
  /** Anon key (legacy) or publishable key (`sb_publishable_...`). */
  key: string;
}

const schema = z.object({
  url: z.url({ error: "NEXT_PUBLIC_SUPABASE_URL must be a full URL such as https://abcd.supabase.co" }),
  key: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set" })
    .trim()
    .min(20, { error: "NEXT_PUBLIC_SUPABASE_ANON_KEY looks too short to be a Supabase key" }),
});

export type SupabaseEnvResult =
  | { ok: true; value: SupabasePublicEnv }
  | { ok: false; issues: string[] };

/** Pure validation so it can be unit-tested with fixtures. */
export function parseSupabasePublicEnv(raw: {
  url: string | undefined;
  key: string | undefined;
}): SupabaseEnvResult {
  const url = raw.url?.trim() || undefined;
  const key = raw.key?.trim() || undefined;
  if (!url && !key) {
    return {
      ok: false,
      issues: ["NEXT_PUBLIC_SUPABASE_URL is not set", "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set"],
    };
  }
  const parsed = schema.safeParse({ url, key });
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => issue.message) };
  }
  return { ok: true, value: parsed.data };
}

export function readSupabasePublicEnv(): SupabaseEnvResult {
  return parseSupabasePublicEnv({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    // Supabase's dashboard now calls this the "publishable key"; accept either name.
    key:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

/** For code that cannot work without Supabase: fails with a readable message. */
export function requireSupabasePublicEnv(): SupabasePublicEnv {
  const result = readSupabasePublicEnv();
  if (!result.ok) {
    throw new Error(
      `Supabase is not configured:\n${result.issues.map((i) => `  - ${i}`).join("\n")}\n` +
        "See docs/supabase-setup.md.",
    );
  }
  return result.value;
}
