import "server-only";
import { z } from "zod";
import { getEnv } from "@/config/env";
import { staffRoles, type StaffRole } from "@/lib/staff-roles";
import { createSupabaseAdminClient } from "@/server/db/admin-client";
import { requireRole } from "./admin-access";

const inviteSchema = z.object({
  email: z.email().max(254),
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  role: z.enum(staffRoles as [StaffRole, ...StaffRole[]]),
  preferredLanguage: z.enum(["en", "km", "zh"]).default("en"),
});

export type InviteStaffInput = z.input<typeof inviteSchema>;
export type InviteStaffResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "already_exists" | "failed" };

/**
 * Invites a new staff member by email and creates their profile.
 *
 * Staff accounts exist only through this path (or the Supabase dashboard):
 * public sign-up is disabled. The caller is verified here, on the server,
 * as a super admin before the service-role key is used. The role is taken
 * from this function's input, never from the invited user.
 *
 * No screen calls this yet; the staff-management UI is a later step.
 */
export async function inviteStaffMember(input: InviteStaffInput): Promise<InviteStaffResult> {
  await requireRole("super_admin");

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { email, fullName, phone, role, preferredLanguage } = parsed.data;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${getEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm`,
  });
  if (error || !data.user) {
    return { ok: false, reason: error?.code === "email_exists" ? "already_exists" : "failed" };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    full_name: fullName,
    phone: phone || null,
    role,
    preferred_language: preferredLanguage,
  });
  if (profileError) {
    // Do not leave an auth user without a profile behind.
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, reason: "failed" };
  }

  return { ok: true, userId: data.user.id };
}
