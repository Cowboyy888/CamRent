/**
 * Form values for a deal's terms. Kept out of the client component file:
 * values exported from a "use client" module are references on the server,
 * not usable objects.
 */
export interface DealFieldValues {
  landlordId: string;
  rent: string;
  currency: "USD" | "KHR";
  leaseStart: string;
  leaseEnd: string;
  deposit: string;
  advance: string;
  agreementRef: string;
  closingDate: string;
  notes: string;
  commissionMethod: string;
  commissionRate: string;
  commissionFixed: string;
  shareMethod: string;
  shareRate: string;
  shareFixed: string;
}

export const emptyDealValues: DealFieldValues = {
  landlordId: "",
  rent: "",
  currency: "USD",
  leaseStart: "",
  leaseEnd: "",
  deposit: "",
  advance: "",
  agreementRef: "",
  closingDate: "",
  notes: "",
  commissionMethod: "",
  commissionRate: "",
  commissionFixed: "",
  shareMethod: "none",
  shareRate: "",
  shareFixed: "",
};

