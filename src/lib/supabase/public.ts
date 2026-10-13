import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabasePublicEnv } from "@/config/supabase-env";
import type { Database } from "@/types/database";

export type PublicSupabaseClient = SupabaseClient<Database>;

/**
 * Anonymous, session-less client for the public website. It never reads
 * cookies, so listing pages do not depend on who is signed in, and it can
 * only reach what the `anon` role may: the public_* views and files of
 * published listings. Create one per request.
 */
export function createSupabasePublicClient(): PublicSupabaseClient {
  const { url, key } = requireSupabasePublicEnv();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
