import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/server/db/admin-client";

/**
 * Scheduler entry point for hosts that call a URL on a schedule (for example
 * Vercel Cron). The database also schedules itself with pg_cron; both paths
 * run the same idempotent function, and an overlapping run is recorded as
 * "skipped", so using both is safe.
 *
 * Authentication: `Authorization: Bearer <CRON_SECRET>`. Without CRON_SECRET
 * configured the route is disabled. Customers are never contacted.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: "disabled" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  const ok = given.length === expected.length && timingSafeEqual(given, expected);
  if (!ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: runId, error } = await admin.rpc("run_automation_scheduled");
    if (error) throw error;
    const { data: run } = await admin
      .from("automation_runs")
      .select("status, summary")
      .eq("id", runId)
      .maybeSingle();
    return NextResponse.json(
      { run: runId, status: run?.status ?? null, summary: run?.summary ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // No details: the run history in the CRM holds the safe error summaries.
    return NextResponse.json({ error: "failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
