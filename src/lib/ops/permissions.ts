import type { StaffRole } from "@/lib/staff-roles";

/** Who may change automation settings, run it and retry failed work (also enforced in the database). */
export const canManageAutomation = (role: StaffRole) => role === "super_admin" || role === "manager";
/** Who sees every task, not only their own (matches the RLS policy on tasks). */
export const canSeeAllTasks = canManageAutomation;
