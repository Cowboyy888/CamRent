import type { StaffRole } from "@/lib/staff-roles";

/**
 * What each role may do in the CRM UI. This only decides what to show and
 * which server checks to run; the database (RLS and triggers) is the
 * authority, see docs/roles-and-permissions.md.
 */
const has = (roles: readonly StaffRole[]) => (role: StaffRole) => roles.includes(role);

/** Leads, activities and viewings. */
export const canViewLeads = has(["super_admin", "manager", "agent"]);
/** Edit customer details, change status, add notes, schedule viewings. */
export const canWorkLeads = canViewLeads;
/** Assign or reassign leads, and see every agent. */
export const canAssignLeads = has(["super_admin", "manager"]);
/** See all agents' performance, not just one's own. */
export const canViewTeam = canAssignLeads;
/** Deals and commission figures. */
export const canViewDeals = has(["super_admin", "manager", "finance"]);
