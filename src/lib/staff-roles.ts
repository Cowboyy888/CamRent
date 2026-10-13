import type { Database } from "@/types/database";

/** Mirrors the `staff_role` enum in the database (supabase/migrations). */
export type StaffRole = Database["public"]["Enums"]["staff_role"];

/** Labels for the (English-only) CRM. `satisfies` makes this exhaustive. */
export const staffRoleLabels = {
  super_admin: "Super admin",
  manager: "Manager",
  agent: "Agent",
  marketing: "Marketing",
  finance: "Finance",
} as const satisfies Record<StaffRole, string>;

export const staffRoles = Object.keys(staffRoleLabels) as StaffRole[];

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (staffRoles as string[]).includes(value);
}

/**
 * Roles that may invite or manage staff accounts. The database enforces the
 * same rule in set_staff_role(); this is the server-side pre-check.
 */
export const staffManagerRoles: readonly StaffRole[] = ["super_admin"];
