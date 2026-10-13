/**
 * Maps database rejections to dictionary error codes. The SQL messages are
 * English and technical; staff see a translated message for the code instead.
 */
export type FinanceErrorCode =
  | "invalid"
  | "forbidden"
  | "notFound"
  | "exceedsOutstanding"
  | "exceedsEligible"
  | "incompleteDeal"
  | "invalidTransition"
  | "duplicateDeal"
  | "leaseOverlap"
  | "termsFrozen"
  | "reasonRequired"
  | "futureDate"
  | "receivablesExceed"
  | "dealNotClosed"
  | "sameApprover"
  | "alreadyDecided"
  | "shareTooHigh"
  | "unexpected";

export function mapDatabaseError(error: {
  code?: string;
  message?: string;
  details?: string;
}): FinanceErrorCode {
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (text.includes("rental_deals_won_needs_terms")) return "incompleteDeal";
  if (text.includes("rental_deals_ended_needs_reason")) return "reasonRequired";
  if (text.includes("rental_deals_one_active_per_transaction")) return "duplicateDeal";
  if (text.includes("rental_deals_no_overlapping_leases")) return "leaseOverlap";
  if (text.includes("exceeds the outstanding") || text.includes("make the balance negative")) {
    return "exceedsOutstanding";
  }
  if (text.includes("exceeds the amount") || text.includes("exceeds the unreversed")) {
    return text.includes("unreversed") ? "exceedsOutstanding" : "exceedsEligible";
  }
  if (text.includes("cannot move from") || text.includes("cannot be decided again")) {
    return text.includes("decided") ? "alreadyDecided" : "invalidTransition";
  }
  if (text.includes("a deal cannot move")) return "invalidTransition";
  if (text.includes("terms of a closed deal")) return "termsFrozen";
  if (text.includes("reason is required")) return "reasonRequired";
  if (text.includes("future")) return "futureDate";
  if (text.includes("would exceed")) return "receivablesExceed";
  if (text.includes("closed-won deal")) return "dealNotClosed";
  if (text.includes("person who requested") || text.includes("person who created")) return "sameApprover";
  if (text.includes("agent share cannot exceed")) return "shareTooHigh";
  if (error.code === "42501") return "forbidden";
  if (error.code === "23514") return "invalid";
  return "unexpected";
}
