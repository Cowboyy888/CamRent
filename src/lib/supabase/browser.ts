"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabasePublicEnv } from "@/config/supabase-env";
import type { Database } from "@/types/database";

/**
 * Supabase client for Client Components. It uses only the public key, so
 * every query is subject to Row Level Security as the signed-in user.
 * Staff sign-in and sign-out go through Server Actions; use this client for
 * reads that must happen in the browser.
 */
export function createSupabaseBrowserClient() {
  const { url, key } = requireSupabasePublicEnv();
  return createBrowserClient<Database>(url, key);
}
