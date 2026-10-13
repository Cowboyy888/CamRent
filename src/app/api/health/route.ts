import { NextResponse } from "next/server";
import { readSupabasePublicEnv } from "@/config/supabase-env";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * Liveness and database reachability for uptime monitors and post-deploy
 * smoke tests. It reads one row count through the anonymous public view and
 * returns no data and no error detail.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!readSupabasePublicEnv().ok) {
    return NextResponse.json({ status: "degraded", database: "not_configured" }, { status: 503, headers });
  }
  try {
    const { error } = await createSupabasePublicClient()
      .from("public_properties")
      .select("id", { count: "exact", head: true });
    if (error) throw error;
    return NextResponse.json({ status: "ok", database: "ok" }, { headers });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unreachable" }, { status: 503, headers });
  }
}
