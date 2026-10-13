import { siteConfig } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { localeMeta } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { displayStage } from "@/lib/finance/deals";
import { formatArea, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { agreementDraft } from "./agreement-draft";
import type {
  AgreementData,
  CommissionData,
  DealData,
  DocumentData,
  InquiryData,
  ListingData,
  PayoutData,
  SubmissionData,
  ViewingData,
} from "./data";
import { DocWriter } from "./pdf";

export interface RenderContext {
  dict: Dictionary;
  locale: Locale;
  reference: string;
  issuedAt: Date;
  preparedBy: string;
}

type Currency = "USD" | "KHR";
const num = (v: unknown) => Number(v);

function createWriter(title: string, ctx: RenderContext, banner?: string) {
  const { dict, locale, reference, issuedAt } = ctx;
  const d = dict.ops.docs;
  const issued = formatDate(new Date(issuedAt.getTime() + 7 * 3_600_000).toISOString().slice(0, 10), locale);
  const contact = [siteConfig.contact.phone, siteConfig.contact.email, siteConfig.contact.address].filter(
    (v): v is string => Boolean(v),
  );
  const writer = new DocWriter({
    title,
    reference,
    agency: siteConfig.legalName ?? siteConfig.name,
    banner,
    subtitleLines: [
      `${d.referenceLabel}: ${reference}   ·   ${d.issueDate}: ${issued}`,
      `${d.preparedBy}: ${ctx.preparedBy}   ·   ${d.language}: ${dict.ops.documents.languages[locale]}`,
      ...(contact.length > 0 ? [`${d.contact}: ${contact.join("  ·  ")}`] : []),
    ],
    footer: d.confidential,
    pageTemplate: d.page,
  });
  return writer;
}

const rowsOf = (rows: Array<[string, string | null | undefined | false]>): Array<[string, string]> =>
  rows.filter((r): r is [string, string] => typeof r[1] === "string" && r[1].trim() !== "");

function area(p: { neighborhood: string | null; district: string | null; city: string }) {
  return [p.neighborhood, p.district, p.city].filter(Boolean).join(", ");
}

function money(minor: number | string | null | undefined, currency: Currency) {
  return minor === null || minor === undefined ? null : formatMoney({ amountMinor: num(minor), currency });
}

function closing(w: DocWriter, ctx: RenderContext, extra: string[] = []) {
  const d = ctx.dict.ops.docs;
  w.rule();
  for (const line of extra) w.note(line);
  w.note(d.notBinding);
  w.paragraph(
    interpolate(d.generatedAt, {
      date: formatDateTime(ctx.issuedAt.toISOString(), ctx.locale),
    }),
    { muted: true, size: 8.5 },
  );
}

// ---------------------------------------------------------------------------

function listing(data: ListingData, ctx: RenderContext) {
  const { dict, locale } = ctx;
  const d = dict.ops.docs;
  const p = data.property;
  const w = createWriter(d.listing.title, ctx);
  const cur = p.currency;
  const title = data.title ?? p.listing_code;

  w.section(title);
  w.keyValues(
    rowsOf([
      [d.fields.property, p.listing_code],
      [d.fields.category, dict.search[p.category]],
      [d.fields.propertyType, dict.propertyTypes[p.property_type]],
      [d.fields.location, area(p)],
      [d.fields.rent, money(p.monthly_rent_minor, cur) && `${money(p.monthly_rent_minor, cur)} ${dict.property.perMonth}`],
      [d.fields.deposit, money(p.deposit_amount_minor, cur)],
      [d.fields.bedrooms, p.bedrooms === null ? null : p.bedrooms === 0 ? dict.property.studio : String(p.bedrooms)],
      [d.fields.bathrooms, p.bathrooms === null ? null : String(p.bathrooms)],
      [d.fields.size, p.floor_area === null ? null : formatArea(num(p.floor_area), p.area_unit)],
      [d.fields.furnishing, p.furnishing_status ? dict.furnishingOptions[p.furnishing_status] : null],
      [
        d.fields.availability,
        p.availability_status === "available_from" && p.available_from
          ? interpolate(dict.property.availableFrom, { date: formatDate(p.available_from, locale) })
          : p.availability_status === "available"
            ? dict.property.availableNow
            : null,
      ],
      [d.fields.leaseTerms, p.lease_terms],
    ]),
  );
  if (data.description) {
    w.section(d.sections.description);
    w.paragraph(data.description);
  }
  if (data.amenities.length > 0) {
    w.section(d.sections.amenities);
    w.paragraph(data.amenities.join("  ·  "));
  }
  const notes: string[] = [];
  if (p.publication_status !== "published") notes.push(d.listing.unpublished);
  if (data.textLocale && data.textLocale !== locale) {
    notes.push(
      interpolate(d.listing.translationMissing, {
        language: dict.ops.documents.languages[locale],
        fallback: dict.ops.documents.languages[data.textLocale],
      }),
    );
  }
  closing(w, ctx, notes);
  return w;
}

function inquiry(data: InquiryData, ctx: RenderContext) {
  const { dict, locale } = ctx;
  const d = dict.ops.docs;
  const l = data.lead;
  const w = createWriter(d.inquiry.title, ctx);
  w.section(d.sections.summary);
  w.keyValues(
    rowsOf([
      [d.fields.customer, l.customer_name],
      [d.fields.phone, l.phone],
      [d.fields.email, l.email],
      [d.fields.preferredLanguage, dict.ops.documents.languages[l.preferred_language]],
      [d.fields.source, dict.crm.sources[l.source]],
      [d.fields.status, dict.crm.stages[l.stage]],
      [d.fields.assignedAgent, data.agentName],
      [d.fields.property, data.propertyReference],
      [d.fields.received, formatDateTime(l.created_at, locale)],
      [d.fields.nextFollowUp, l.next_follow_up_at ? formatDateTime(l.next_follow_up_at, locale) : null],
      [d.fields.customerMessage, l.enquiry_message],
    ]),
  );
  const budget =
    l.budget_min_minor !== null || l.budget_max_minor !== null
      ? [money(l.budget_min_minor, l.currency), money(l.budget_max_minor, l.currency)].filter(Boolean).join(" – ")
      : null;
  const reqs = rowsOf([
    [d.fields.budget, budget],
    [d.fields.preferredArea, l.preferred_area],
    [d.fields.bedroomsWanted, l.bedrooms_wanted === null ? null : String(l.bedrooms_wanted)],
    [d.fields.moveIn, l.desired_move_in ? formatDate(l.desired_move_in, locale) : null],
    [d.fields.period, l.rental_period_months ? interpolate(d.fields.months, { count: l.rental_period_months }) : null],
    [d.fields.requirementsNotes, l.requirements_notes],
  ]);
  if (reqs.length > 0) {
    w.section(d.sections.requirements);
    w.keyValues(reqs);
  }
  if (data.history.length > 0) {
    w.section(d.sections.history);
    w.table(
      [
        { label: d.fields.entryDate, width: 3 },
        { label: d.fields.status, width: 5 },
        { label: d.preparedBy, width: 3 },
      ],
      data.history.map((h) => [
        formatDateTime(h.at, locale),
        `${h.from ? dict.crm.stages[h.from as keyof typeof dict.crm.stages] : "—"} - ${h.to ? dict.crm.stages[h.to as keyof typeof dict.crm.stages] : "—"}`,
        h.by ?? "—",
      ]),
    );
  }
  closing(w, ctx);
  return w;
}

function viewing(data: ViewingData, ctx: RenderContext) {
  const { dict, locale } = ctx;
  const d = dict.ops.docs;
  const v = data.viewing;
  const w = createWriter(d.viewing.title, ctx);
  w.section(d.sections.summary);
  w.paragraph(d.viewing.body, { muted: true });
  w.keyValues(
    rowsOf([
      [d.fields.customer, data.customerName],
      [d.fields.property, data.propertyReference],
      [d.fields.location, data.propertyArea],
      [d.fields.viewingDate, formatDateTime(v.scheduled_at, locale)],
      [d.fields.viewingStatus, dict.crm.lead.viewingStatus[v.status]],
      [d.fields.agent, data.agentName],
    ]),
  );
  closing(w, ctx);
  return w;
}

function deal(data: DealData, ctx: RenderContext) {
  const { dict, locale } = ctx;
  const d = dict.ops.docs;
  const x = data.deal;
  const cur = x.currency;
  const w = createWriter(d.deal.title, ctx);
  w.section(d.sections.parties);
  w.keyValues(
    rowsOf([
      [d.fields.customer, data.customerName],
      [d.fields.landlord, data.landlordName],
      [d.fields.agent, data.agentName],
      [d.fields.property, data.propertyReference],
      [d.fields.dealStatus, dict.fin.dealStages[displayStage(x.stage)]],
    ]),
  );
  w.section(d.sections.terms);
  w.keyValues(
    rowsOf([
      [d.fields.rent, money(x.agreed_monthly_rent_minor, cur)],
      [d.fields.leaseStart, x.lease_start ? formatDate(x.lease_start, locale) : null],
      [d.fields.leaseEnd, x.lease_end ? formatDate(x.lease_end, locale) : null],
      [d.fields.leaseDuration, x.lease_months ? interpolate(d.fields.months, { count: x.lease_months }) : null],
      [d.fields.deposit, money(x.deposit_minor, cur)],
      [d.fields.advance, money(x.advance_rent_minor, cur)],
      [d.fields.agreementRef, x.agreement_reference],
      [d.fields.closingDate, x.closing_date ? formatDate(x.closing_date, locale) : null],
      [d.fields.commissionArrangement, data.expectedCommissionMinor !== null && x.commission_method ? dict.fin.commissionMethods[x.commission_method] : null],
      [d.fields.commissionExpected, money(data.expectedCommissionMinor, cur)],
      [d.fields.agentShare, money(x.agent_share_expected_minor, cur)],
      [d.fields.notes, x.notes],
    ]),
  );
  closing(w, ctx, data.expectedCommissionMinor === null && x.commission_method ? [d.deal.commissionHidden] : []);
  return w;
}

function commission(data: CommissionData, ctx: RenderContext) {
  const { dict, locale } = ctx;
  const d = dict.ops.docs;
  const b = data.balance;
  const cur = (b.currency ?? "USD") as Currency;
  const w = createWriter(d.commission.title, ctx);
  w.section(d.sections.summary);
  w.keyValues(
    rowsOf([
      [d.fields.customer, b.customer_name],
      [d.fields.property, b.property_reference],
      [d.fields.payer, b.payer ? dict.fin.payers[b.payer] : null],
      [d.fields.amountDue, money(b.due_minor, cur)],
      [d.fields.collected, money(b.collected_minor, cur)],
      [d.fields.writtenOff, money(b.written_off_minor, cur)],
      [d.fields.outstanding, money(b.outstanding_minor, cur)],
      [d.fields.dueDate, b.due_date ? formatDate(b.due_date, locale) : null],
      [d.fields.status, b.collection_status ? dict.fin.collection[b.collection_status as keyof typeof dict.fin.collection] : null],
    ]),
  );
  w.section(d.sections.entries);
  if (data.entries.length === 0) w.paragraph(d.notRecorded, { muted: true });
  else {
    w.table(
      [
        { label: d.fields.entryDate, width: 2.5 },
        { label: d.fields.entryType, width: 4 },
        { label: d.fields.amount, width: 3, align: "right" },
        { label: d.fields.method, width: 2.5 },
        { label: d.fields.reference, width: 3 },
      ],
      data.entries.map((e) => [
        formatDate(e.occurred_on, locale),
        dict.fin.entryTypes[e.entry_type] + (e.reason ? ` (${e.reason})` : ""),
        money(e.amount_minor, cur) ?? "",
        e.payment_method ? dict.fin.paymentMethods[e.payment_method] : "—",
        e.reference ?? "—",
      ]),
    );
  }
  closing(w, ctx, [d.commission.notReceipt]);
  return w;
}

function payout(data: PayoutData, ctx: RenderContext) {
  const { dict, locale } = ctx;
  const d = dict.ops.docs;
  const cur = data.deal.currency;
  const f = data.financials;
  const w = createWriter(d.payout.title, ctx);
  w.section(d.sections.summary);
  w.keyValues(
    rowsOf([
      [d.fields.agent, data.agentName],
      [d.fields.customer, data.customerName],
      [d.fields.property, data.propertyReference],
      [d.fields.dealStatus, dict.fin.dealStages[displayStage(data.deal.stage)]],
      [d.fields.agentShare, money(f?.agent_share_minor, cur)],
      [d.fields.eligible, money(f?.agent_eligible_minor, cur)],
      [d.fields.paid, money(f?.agent_paid_minor, cur)],
      [d.fields.pending, money(f?.agent_pending_minor, cur)],
      [d.fields.payoutOutstanding, money(f?.agent_outstanding_minor, cur)],
    ]),
  );
  w.section(d.sections.payouts);
  if (data.payouts.length === 0) w.paragraph(d.notRecorded, { muted: true });
  else {
    w.table(
      [
        { label: d.fields.requested, width: 2.5 },
        { label: d.fields.amount, width: 3, align: "right" },
        { label: d.fields.status, width: 3.5 },
        { label: d.fields.paidOn, width: 2.5 },
        { label: d.fields.reference, width: 3 },
      ],
      data.payouts.map((p) => [
        formatDate(p.created_at.slice(0, 10), locale),
        money(p.amount_minor, p.currency) ?? "",
        dict.fin.payoutStatuses[p.status],
        p.paid_on ? formatDate(p.paid_on, locale) : "—",
        p.payment_reference ?? "—",
      ]),
    );
  }
  closing(w, ctx, [d.payout.notConfirmation]);
  return w;
}

function submission(data: SubmissionData, ctx: RenderContext) {
  const { dict, locale } = ctx;
  const d = dict.ops.docs;
  const s = data.submission;
  const w = createWriter(d.submission.title, ctx);
  w.note(d.submission.unverified);
  w.section(d.sections.summary);
  w.keyValues(
    rowsOf([
      [d.fields.submitter, s.submitter_name],
      [d.fields.relationship, dict.listProperty.relationshipOptions[s.relationship]],
      [d.fields.phone, s.phone],
      [d.fields.email, s.email],
      [d.fields.preferredLanguage, dict.ops.documents.languages[s.preferred_language]],
      [d.fields.category, dict.search[s.property_category]],
      [d.fields.propertyType, s.property_type ? dict.propertyTypes[s.property_type] : null],
      [d.fields.location, [s.neighborhood, s.district].filter(Boolean).join(", ")],
      [d.fields.address, s.address],
      [d.fields.bedrooms, s.bedrooms === null ? null : String(s.bedrooms)],
      [d.fields.expectedRent, money(s.expected_rent_minor, s.currency)],
      [d.fields.notes, s.description],
      [d.fields.submitted, formatDateTime(s.created_at, locale)],
    ]),
  );
  closing(w, ctx);
  return w;
}

function agreement(data: AgreementData, ctx: RenderContext) {
  const { locale } = ctx;
  const a = agreementDraft;
  const x = data.deal;
  const cur = x.currency;
  // English-only on purpose; recorded facts still use the numeric formats.
  const enCtx = { ...ctx, locale: "en" as Locale };
  const w = createWriter(a.title, enCtx, a.banner);
  w.note(a.intro);
  w.section(a.partiesTitle);
  w.keyValues(
    rowsOf([
      [a.landlordLabel, data.landlordName],
      [a.tenantLabel, data.customerName],
      [a.agentLabel, [siteConfig.legalName ?? siteConfig.name, data.agentName].filter(Boolean).join(" / ")],
    ]),
  );
  w.section(a.propertyTitle);
  w.keyValues(rowsOf([["Property reference", data.propertyReference]]));
  w.section(a.termsTitle);
  w.keyValues(
    rowsOf([
      ["Monthly rent", money(x.agreed_monthly_rent_minor, cur)],
      ["Lease start", x.lease_start ? formatDate(x.lease_start, "en") : null],
      ["Lease end", x.lease_end ? formatDate(x.lease_end, "en") : null],
      ["Security deposit", money(x.deposit_minor, cur)],
      ["Advance rent", money(x.advance_rent_minor, cur)],
      ["Agreement reference", x.agreement_reference],
    ]),
  );
  w.section(a.clausesTitle);
  a.clauses.forEach((c, i) => w.keyValues([[`${i + 1}. ${c}`, a.placeholder]]));
  w.paragraph(a.commissionNote, { muted: true });
  w.section(a.signaturesTitle);
  w.paragraph(a.signaturesNote, { muted: true });
  for (const line of a.signatureLines) w.keyValues([[line, " "]]);
  w.note(ctx.dict.ops.docs.notBinding);
  void locale;
  return w;
}

export async function renderDocument(data: DocumentData, ctx: RenderContext): Promise<Buffer> {
  const writer = (() => {
    switch (data.kind) {
      case "listing_sheet":
        return listing(data, ctx);
      case "inquiry_summary":
        return inquiry(data, ctx);
      case "viewing_confirmation":
        return viewing(data, ctx);
      case "deal_summary":
        return deal(data, ctx);
      case "commission_statement":
        return commission(data, ctx);
      case "payout_statement":
        return payout(data, ctx);
      case "landlord_submission":
        return submission(data, ctx);
      case "agreement_draft":
        return agreement(data, ctx);
    }
  })();
  return writer.finish();
}

/** Exposed so tests can see what each locale's PDF can print. */
export { localeMeta };
