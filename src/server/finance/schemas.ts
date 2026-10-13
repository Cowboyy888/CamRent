import { z } from "zod";
import { dealStages } from "@/lib/finance/deals";
import { parseMajorToMinor, parsePercentScaled } from "@/lib/finance/money";

/** Validation for finance forms. Server-side only; HTML attributes are a convenience. */
const blank = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/** "1,250.50" -> 125050 (minor units), rejecting anything not an exact amount. */
const minor = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const parsed = parseMajorToMinor(value);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: "invalid amount" });
      return z.NEVER;
    }
    return parsed;
  });
const positiveMinor = minor.refine((value) => value > 0, "must be more than zero");
export const money = z.preprocess(blank, minor.optional());
export const positiveMoney = positiveMinor;

/** A percentage 0..100 with up to four decimals, kept as the typed string. */
export const percent = z.preprocess(
  blank,
  z
    .string()
    .trim()
    .refine((value) => parsePercentScaled(value) !== null, "invalid percentage")
    .optional(),
);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const optionalDate = z.preprocess(blank, isoDate.optional());
export const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
export const guid = z.guid();
export const optionalGuid = z.preprocess(blank, z.guid().optional());
export const currency = z.enum(["USD", "KHR"]);
export const paymentMethod = z.enum(["cash", "bank_transfer", "aba", "wing", "other"]);
export const optionalPaymentMethod = z.preprocess(blank, paymentMethod.optional());

const commissionMethod = z.enum([
  "fixed_amount",
  "percent_of_monthly_rent",
  "percent_of_total_rent",
  "custom_amount",
]);
const shareMethod = z.enum(["none", "percent_of_commission", "fixed_amount"]);

const arrangement = {
  commissionMethod: z.preprocess(blank, commissionMethod.optional()),
  commissionRate: percent,
  commissionFixed: money,
  shareMethod: z.preprocess(blank, shareMethod.default("none")),
  shareRate: percent,
  shareFixed: money,
};

export const dealTermsSchema = z.object({
  landlordId: optionalGuid,
  rent: money,
  currency,
  leaseStart: optionalDate,
  leaseEnd: optionalDate,
  deposit: money,
  advance: money,
  agreementRef: text(120),
  closingDate: optionalDate,
  notes: text(2000),
  ...arrangement,
});

export const createDealSchema = dealTermsSchema.extend({
  leadId: guid,
  propertyRef: text(60),
  agentId: optionalGuid,
});

type Terms = z.infer<typeof dealTermsSchema>;

/** Fields whose combination is wrong, so the form can mark them. */
export function arrangementProblems(t: Terms): string[] {
  const bad: string[] = [];
  if (t.commissionMethod) {
    const percentage =
      t.commissionMethod === "percent_of_monthly_rent" ||
      t.commissionMethod === "percent_of_total_rent";
    if (percentage && t.commissionRate === undefined) bad.push("commissionRate");
    if (!percentage && t.commissionFixed === undefined) bad.push("commissionFixed");
  }
  if (t.shareMethod === "percent_of_commission" && t.shareRate === undefined) bad.push("shareRate");
  if (t.shareMethod === "fixed_amount" && t.shareFixed === undefined) bad.push("shareFixed");
  if (t.shareMethod !== "none" && !t.commissionMethod) bad.push("commissionMethod");
  if (t.leaseStart && t.leaseEnd && t.leaseEnd <= t.leaseStart) bad.push("leaseEnd");
  return bad;
}

/** Column values for the stored arrangement; unused columns are explicitly null. */
export function termsColumns(t: Terms) {
  const percentage =
    t.commissionMethod === "percent_of_monthly_rent" ||
    t.commissionMethod === "percent_of_total_rent";
  return {
    landlord_id: t.landlordId ?? null,
    agreed_monthly_rent_minor: t.rent ?? null,
    currency: t.currency,
    lease_start: t.leaseStart ?? null,
    lease_end: t.leaseEnd ?? null,
    deposit_minor: t.deposit ?? null,
    advance_rent_minor: t.advance ?? null,
    agreement_reference: t.agreementRef ?? null,
    closing_date: t.closingDate ?? null,
    notes: t.notes ?? null,
    commission_method: t.commissionMethod ?? null,
    commission_rate: t.commissionMethod && percentage ? Number(t.commissionRate) : null,
    commission_fixed_minor: t.commissionMethod && !percentage ? (t.commissionFixed ?? null) : null,
    agent_share_method: t.shareMethod,
    agent_share_rate: t.shareMethod === "percent_of_commission" ? Number(t.shareRate) : null,
    agent_share_fixed_minor: t.shareMethod === "fixed_amount" ? (t.shareFixed ?? null) : null,
  };
}

export const stageSchema = z.object({
  id: guid,
  stage: z.enum(dealStages),
  reason: text(500),
});

export const receivableSchema = z.object({
  dealId: guid,
  payer: z.enum(["landlord", "tenant", "other"]),
  amount: positiveMoney,
  dueDate: optionalDate,
  invoicedOn: optionalDate,
  notes: text(1000),
});

export const receivableTermsSchema = z.object({
  id: guid,
  dueDate: optionalDate,
  invoicedOn: optionalDate,
  notes: text(1000),
});

export const ledgerSchema = z.object({
  commissionId: guid,
  entryType: z.enum(["payment", "reversal", "write_off", "adjustment_up", "adjustment_down"]),
  amount: positiveMoney,
  occurredOn: isoDate,
  method: optionalPaymentMethod,
  reference: text(120),
  reason: text(500),
  notes: text(1000),
  reversesId: optionalGuid,
});

export const payoutRequestSchema = z.object({ dealId: guid, amount: positiveMoney, notes: text(1000) });

export const payoutDecisionSchema = z.object({
  id: guid,
  decision: z.enum(["approve", "reject", "cancel", "pay", "reverse"]),
  reason: text(500),
  paidOn: optionalDate,
  method: optionalPaymentMethod,
  reference: text(120),
});

export const expenseSchema = z.object({
  date: isoDate,
  category: z.enum([
    "advertising",
    "transportation",
    "office_rent",
    "staff_costs",
    "marketing_materials",
    "utilities",
    "other",
  ]),
  description: z.string().trim().min(1).max(500),
  amount: positiveMoney,
  currency,
  method: optionalPaymentMethod,
  vendor: text(200),
});

export const expenseDecisionSchema = z.object({
  id: guid,
  decision: z.enum(["approve", "reject", "paid"]),
  reason: text(500),
  paidOn: optionalDate,
});

export const settingsSchema = z.object({
  earnedRule: z.enum(["on_closed_won", "on_collection"]),
  payoutRule: z.enum(["on_collected", "on_earned"]),
  defaultMethod: z.preprocess(blank, commissionMethod.optional()),
  defaultRate: percent,
  defaultFixed: money,
  defaultShareMethod: z.preprocess(blank, shareMethod.default("none")),
  defaultShareRate: percent,
  defaultShareFixed: money,
});

export const documentKind = z.enum(["agreement", "receipt", "other"]);
