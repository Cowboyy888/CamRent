import type { Database } from "@/types/database";

export type DealStage = Database["public"]["Enums"]["deal_stage"];

/** Statuses offered in the CRM. Legacy enum values are mapped, never chosen. */
export const dealStages = [
  "negotiation",
  "reserved",
  "agreement_pending",
  "closed_won",
  "closed_lost",
  "cancelled",
  "lease_expired",
] as const satisfies readonly DealStage[];

/** Statuses that count as a live transaction (one per lead and property). */
export const activeDealStages: readonly DealStage[] = [
  "negotiation",
  "reserved",
  "agreement_pending",
  "closed_won",
];

/** Mirrors private.deal_transition_allowed() in the database (the authority). */
const transitions: Record<string, readonly DealStage[]> = {
  negotiation: ["reserved", "agreement_pending", "closed_lost", "cancelled"],
  reserved: ["negotiation", "agreement_pending", "closed_lost", "cancelled"],
  agreement_pending: ["reserved", "closed_won", "closed_lost", "cancelled"],
  closed_won: ["lease_expired", "cancelled"],
  closed_lost: ["negotiation"],
  cancelled: ["negotiation"],
};

export function allowedTransitions(from: DealStage): readonly DealStage[] {
  return transitions[from] ?? [];
}

/** Statuses an agent may never set (closing and ending are management's). */
export const managerOnlyStages: readonly DealStage[] = ["closed_won", "lease_expired", "cancelled"];

export const stagesNeedingReason: readonly DealStage[] = ["closed_lost", "cancelled"];

/** Legacy enum values from earlier steps, shown as their modern equivalent. */
export function displayStage(stage: DealStage): (typeof dealStages)[number] {
  switch (stage) {
    case "lease_signed":
    case "commission_invoiced":
    case "commission_collected":
      return "closed_won";
    case "lost":
      return "closed_lost";
    default:
      return stage as (typeof dealStages)[number];
  }
}

export interface CloseWonInput {
  agreedMonthlyRentMinor: number | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  landlordId: string | null;
  closingDate: string | null;
  agreementReference: string | null;
  commissionMethod: string | null;
  commissionExpectedMinor: number | null;
}

/** Field names still missing before a deal may be closed as won. */
export function missingForClosedWon(deal: CloseWonInput): string[] {
  const missing: string[] = [];
  if (deal.agreedMonthlyRentMinor === null) missing.push("rent");
  if (!deal.leaseStart) missing.push("leaseStart");
  if (!deal.leaseEnd) missing.push("leaseEnd");
  if (!deal.landlordId) missing.push("landlord");
  if (!deal.closingDate) missing.push("closingDate");
  if (!deal.agreementReference?.trim()) missing.push("agreementReference");
  if (!deal.commissionMethod) missing.push("commission");
  else if (deal.commissionExpectedMinor === null) missing.push("commissionAmount");
  return missing;
}
