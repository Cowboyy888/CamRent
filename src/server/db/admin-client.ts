import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireSupabasePublicEnv } from "@/config/supabase-env";
import type { Database } from "@/types/database";

/**
 * Service-role Supabase client. It BYPASSES Row Level Security.
 *
 * Rules:
 *  - import it only from trusted server code (Server Actions, Route
 *    Handlers, jobs), never from a Client Component (the `server-only`
 *    import above makes the build fail if you do);
 *  - authorise the caller first (requireRole) and scope every query;
 *  - the key is read from SUPABASE_SERVICE_ROLE_KEY, which must not have a
 *    NEXT_PUBLIC_ prefix.
 */
export function createSupabaseAdminClient() {
  const { url } = requireSupabasePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. See docs/supabase-setup.md.");
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
