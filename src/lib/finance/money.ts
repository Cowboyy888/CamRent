/**
 * Decimal-safe money helpers. Amounts are integers in minor units (cents of a
 * dollar, or the riel amount x 100 like the rest of the app) and percentages
 * are parsed from strings, never from floating-point arithmetic. The
 * calculations mirror private.commission_amount() in the database, which is
 * the authority; tests keep the two in step.
 */
import type { Database } from "@/types/database";

export type CommissionMethod = Database["public"]["Enums"]["commission_method"];
export type AgentShareMethod = Database["public"]["Enums"]["agent_share_method"];

const MAX_MINOR = 9_999_999_999_999n; // far below NUMERIC(18,0), far above any real deal

/** "1,250.50" -> 125050. Accepts at most two decimals; returns null if invalid. */
export function parseMajorToMinor(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, "");
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = BigInt(match[1] as string);
  const cents = BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  const total = whole * 100n + cents;
  if (total > MAX_MINOR) return null;
  return Number(total);
}

/** 125050 -> "1250.50" (plain, for form fields). */
export function minorToMajorString(minor: number | string | null | undefined): string {
  if (minor === null || minor === undefined || minor === "") return "";
  const value = BigInt(Math.round(Number(minor)));
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const whole = abs / 100n;
  const cents = abs % 100n;
  return cents === 0n ? `${sign}${whole}` : `${sign}${whole}.${cents.toString().padStart(2, "0")}`;
}

/** "33.3333" -> 333333 (percent x 10,000). null if it is not a percentage 0..100 with <= 4 decimals. */
export function parsePercentScaled(input: string): bigint | null {
  const match = /^(\d{1,3})(?:\.(\d{1,4}))?$/.exec(input.trim());
  if (!match) return null;
  const scaled = BigInt(match[1] as string) * 10_000n + BigInt((match[2] ?? "").padEnd(4, "0") || "0");
  return scaled > 1_000_000n ? null : scaled;
}

/** amount x percent / 100, rounded half up to a whole minor unit. */
export function percentOf(amountMinor: number, percent: string): number | null {
  const scaled = parsePercentScaled(percent);
  if (scaled === null || !Number.isInteger(amountMinor) || amountMinor < 0) return null;
  // amount x (scaled / 1,000,000), half up
  return Number((BigInt(amountMinor) * scaled + 500_000n) / 1_000_000n);
}

/**
 * Whole months from `start` through `end` inclusive (2031-01-01..2031-12-31 is
 * 12). A lease shorter than one month has no whole months (null).
 */
export function leaseMonths(start: string, end: string): number | null {
  const s = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
  const e = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end);
  if (!s || !e) return null;
  const [sy, sm, sd] = [Number(s[1]), Number(s[2]), Number(s[3])];
  // end + 1 day
  const after = new Date(Date.UTC(Number(e[1]), Number(e[2]) - 1, Number(e[3]) + 1));
  const [ey, em, ed] = [after.getUTCFullYear(), after.getUTCMonth() + 1, after.getUTCDate()];
  let months = (ey - sy) * 12 + (em - sm);
  if (ed < sd) months -= 1;
  return months >= 1 ? months : null;
}

export interface CommissionArrangement {
  method: CommissionMethod;
  /** Percent as typed ("50", "33.3333") for percentage methods. */
  rate?: string | null;
  /** Minor units for fixed / custom methods. */
  fixedMinor?: number | null;
}

/** Expected agency commission in minor units, or null if the inputs are not enough. */
export function expectedCommission(
  arrangement: CommissionArrangement,
  monthlyRentMinor: number | null,
  months: number | null,
): number | null {
  switch (arrangement.method) {
    case "fixed_amount":
    case "custom_amount":
      return arrangement.fixedMinor ?? null;
    case "percent_of_monthly_rent":
      if (monthlyRentMinor === null || !arrangement.rate) return null;
      return percentOf(monthlyRentMinor, arrangement.rate);
    case "percent_of_total_rent":
      if (monthlyRentMinor === null || months === null || months < 1 || !arrangement.rate) return null;
      return percentOf(monthlyRentMinor * months, arrangement.rate);
  }
}

export interface AgentShareArrangement {
  method: AgentShareMethod;
  rate?: string | null;
  fixedMinor?: number | null;
}

/** The agent's share of the agency commission, or null when it cannot be known. */
export function expectedAgentShare(
  arrangement: AgentShareArrangement,
  commissionMinor: number | null,
): number | null {
  switch (arrangement.method) {
    case "none":
      return 0;
    case "fixed_amount":
      return arrangement.fixedMinor ?? null;
    case "percent_of_commission":
      if (commissionMinor === null || !arrangement.rate) return null;
      return percentOf(commissionMinor, arrangement.rate);
  }
}

/** Outstanding = amount due (incl. adjustments) - collected - written off. Never negative. */
export function outstandingBalance(input: {
  agreedMinor: number;
  adjustmentMinor: number;
  collectedMinor: number;
  writtenOffMinor: number;
}): number {
  const value =
    input.agreedMinor + input.adjustmentMinor - input.collectedMinor - input.writtenOffMinor;
  return value < 0 ? 0 : value;
}

export type CollectionStatus =
  | "not_due"
  | "due"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "written_off";

/** Mirrors commission_balances.collection_status. `today` is a Phnom Penh YYYY-MM-DD. */
export function collectionStatus(input: {
  outstandingMinor: number;
  collectedMinor: number;
  writtenOffMinor: number;
  dueDate: string | null;
  today: string;
}): CollectionStatus {
  if (input.outstandingMinor === 0) return input.writtenOffMinor > 0 ? "written_off" : "paid";
  if (input.dueDate && input.dueDate < input.today) return "overdue";
  if (input.collectedMinor > 0) return "partially_paid";
  if (input.dueDate && input.dueDate <= input.today) return "due";
  return "not_due";
}

/**
 * How much of the agent's share may be paid so far.
 * on_collected: proportional to the collected part of the expected commission;
 * on_earned: the whole share once the commission is earned.
 */
export function agentEligible(input: {
  rule: "on_collected" | "on_earned";
  shareMinor: number;
  commissionMinor: number;
  collectedMinor: number;
  closed: boolean;
}): number {
  if (!input.closed || input.shareMinor === 0 || input.commissionMinor === 0) return 0;
  if (input.rule === "on_earned") return input.shareMinor;
  const collected = Math.min(input.collectedMinor, input.commissionMinor);
  return Number((BigInt(input.shareMinor) * BigInt(collected)) / BigInt(input.commissionMinor));
}
