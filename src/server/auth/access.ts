import { isStaffRole, type StaffRole } from "@/lib/staff-roles";

/** Who is asking for the CRM. Pure types and logic; see admin-access.ts. */
export type AdminAccess =
  | { status: "anonymous" }
  | {
      status: "authenticated";
      userId: string;
      role: StaffRole;
      fullName: string;
      email: string | null;
    };

export interface ProfileRow {
  full_name: string;
  role: string;
  is_active: boolean;
}

/**
 * Turns a verified user id and the user's profile row into an access
 * decision. A signed-in user without an active staff profile is treated as
 * anonymous: authentication alone never grants CRM access.
 */
export function resolveAdminAccess(
  userId: string | null,
  email: string | null,
  profile: ProfileRow | null | undefined,
): AdminAccess {
  if (!userId || !profile || !profile.is_active || !isStaffRole(profile.role)) {
    return { status: "anonymous" };
  }
  return {
    status: "authenticated",
    userId,
    role: profile.role,
    fullName: profile.full_name,
    email,
  };
}
