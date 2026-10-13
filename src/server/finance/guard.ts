import { notFound } from "next/navigation";
import { requireAdminAccess } from "@/server/auth/admin-access";
import type { StaffRole } from "@/lib/staff-roles";

/** Signed-in active staff whose role passes `allowed`; anyone else gets a 404. */
export async function requireCapability(allowed: (role: StaffRole) => boolean) {
  const access = await requireAdminAccess();
  if (!allowed(access.role)) notFound();
  return access;
}
