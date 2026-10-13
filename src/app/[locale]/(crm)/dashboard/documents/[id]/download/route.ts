import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminAccess } from "@/server/auth/admin-access";

/**
 * Streams a generated PDF. The caller must be signed-in staff who may read the
 * document record (row level security), and the file itself is read through
 * the caller's own session, so storage policies apply as well. No public or
 * long-lived link is ever created.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const access = await getAdminAccess();
  if (access.status !== "authenticated") return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await context.params;
  if (!UUID.test(id)) return new NextResponse("Not found", { status: 404 });

  const client = await createSupabaseServerClient();
  const { data: doc } = await client
    .from("generated_documents")
    .select("storage_path, file_name")
    .eq("id", id)
    .maybeSingle();
  if (!doc?.storage_path) return new NextResponse("Not found", { status: 404 });

  const file = await client.storage.from("private-docs").download(doc.storage_path);
  if (file.error || !file.data) return new NextResponse("Not found", { status: 404 });

  const name = (doc.file_name ?? "document.pdf").replace(/[^A-Za-z0-9._-]/g, "_");
  return new NextResponse(await file.data.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
