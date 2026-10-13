import type { StaffRole } from "@/lib/staff-roles";

/**
 * Finance permissions for the UI and server pre-checks. The database (RLS,
 * column privileges, triggers) enforces the same rules and is the authority;
 * see docs/finance.md.
 */
const has = (roles: readonly StaffRole[]) => (role: StaffRole) => roles.includes(role);

/** Deals list and detail. */
export const canViewDeals = has(["super_admin", "manager", "agent", "finance"]);
/** Create and edit deals, change status (the database narrows agents further). */
export const canWorkDeals = has(["super_admin", "manager", "agent"]);
/** Receivable list, ledger, balances. */
export const canViewReceivables = has(["super_admin", "manager", "finance", "agent"]);
/** Raise receivables (the amounts owed to the agency). */
export const canRaiseReceivables = has(["super_admin", "manager", "finance"]);
/** Record payments, reversals, adjustments and write-offs. */
export const canRecordCollections = has(["super_admin", "finance"]);
/** Request agent payouts. */
export const canRequestPayouts = has(["super_admin", "manager", "finance"]);
/** Approve or reject agent payouts and expenses. */
export const canApprove = has(["super_admin", "manager"]);
/** Record a payout as paid. */
export const canMarkPayoutPaid = has(["super_admin", "finance"]);
/** Payout list. */
export const canViewPayouts = has(["super_admin", "manager", "finance", "agent"]);
/** Expenses: sensitive, management and finance only. */
export const canViewExpenses = has(["super_admin", "manager", "finance"]);
export const canCreateExpenses = canViewExpenses;
/** Financial dashboard, reports, audit log, CSV. */
export const canViewFinance = has(["super_admin", "manager", "finance"]);
export const canViewAudit = canViewFinance;
/** Agency finance rules. */
export const canEditFinanceSettings = has(["super_admin"]);

export type ExportReport = "receivables" | "payments" | "payouts" | "expenses" | "deals";

const exportRoles: Record<ExportReport, readonly StaffRole[]> = {
  receivables: ["super_admin", "manager", "finance"],
  payments: ["super_admin", "finance"],
  payouts: ["super_admin", "manager", "finance", "agent"],
  expenses: ["super_admin", "manager", "finance"],
  deals: ["super_admin", "manager", "finance", "agent"],
};

export function canExport(role: StaffRole, report: ExportReport): boolean {
  return exportRoles[report].includes(role);
}

export const exportReports = Object.keys(exportRoles) as ExportReport[];
