import fs from "node:fs";
import { describe, expect, it } from "vitest";
import * as fontkit from "fontkit";
import { locales, type Locale } from "@/i18n/config";
import { loadDictionary } from "@/i18n/dictionaries";
import { documentFileName, effectiveLocale, documentTypes } from "@/server/documents/catalog";
import type { DocumentData } from "@/server/documents/data";
import { fontFiles, splitRuns, dominantScript } from "@/server/documents/fonts";
import { renderDocument } from "@/server/documents/render";

/** Extracts the text of a PDF, to prove what was printed (and that fonts map back to real text). */
async function pdfText(bytes: Buffer): Promise<{ text: string; pages: number; fonts: string[] }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  let text = "";
  const fonts = new Set<string>();
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    const ops = await page.getOperatorList();
    void ops;
  }
  const meta = await doc.getMetadata();
  void meta;
  return { text, pages: doc.numPages, fonts: [...fonts] };
}

const NOW = new Date("2026-10-14T03:00:00Z");
const base = {
  id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-10-01T02:00:00Z",
  updated_at: "2026-10-01T02:00:00Z",
};

function sample(): Record<string, DocumentData> {
  const property = {
    ...base, listing_code: "PP-R-0001", category: "residential", property_type: "condo",
    city: "Phnom Penh", district: "Chamkar Mon", neighborhood: "BKK1", address: "SECRET ADDRESS 1",
    latitude: null, longitude: null, monthly_rent_minor: 90000, currency: "USD", bedrooms: 2, bathrooms: 2,
    floor_area: 85, area_unit: "sqm", furnishing_status: "fully_furnished", deposit_amount_minor: 180000,
    lease_terms: "12 months", availability_status: "available", available_from: null,
    publication_status: "published", assigned_agent_id: null, created_by: base.id, archived_at: null,
  } as never;
  const lead = {
    ...base, customer_name: "ស៊ុន សុខា / 李明", email: "a@example.test", phone: "+855 12 345 678",
    preferred_language: "km", source: "website_form", campaign: null, property_id: null,
    budget_min_minor: 60000, budget_max_minor: 90000, currency: "USD", preferred_area: "BKK1",
    property_category: "residential", assigned_agent_id: null, stage: "contacted",
    next_follow_up_at: null, lost_reason: null, enquiry_message: "Interested in a 2-bedroom.",
    desired_move_in: "2026-11-01", rental_period_months: 12, bedrooms_wanted: 2,
    requirements_notes: null, sla_breached_at: null,
  } as never;
  const deal = {
    ...base, lead_id: base.id, property_id: base.id, agent_id: base.id, landlord_id: base.id,
    agreed_monthly_rent_minor: 90000, currency: "USD", lease_start: "2026-11-01", lease_end: "2027-10-31",
    stage: "closed_won", closed_at: null, deposit_minor: 90000, advance_rent_minor: 90000,
    agreement_reference: "AGR-1", closing_date: "2026-10-20", notes: "Pet friendly", status_reason: null,
    lease_months: 12, commission_method: "percent_of_monthly_rent", commission_rate: 50,
    commission_fixed_minor: null, commission_expected_minor: 45000, agent_share_method: "percent_of_commission",
    agent_share_rate: 40, agent_share_fixed_minor: null, agent_share_expected_minor: 18000,
  } as never;
  return {
    listing_sheet: { kind: "listing_sheet", property, title: "Bright 2-bedroom condo", description: "Close to cafes.", amenities: ["Gym", "Pool"], textLocale: "en" },
    inquiry_summary: { kind: "inquiry_summary", lead, propertyReference: "PP-R-0001", agentName: "Dara Sok", history: [{ at: "2026-10-02T02:00:00Z", from: "new", to: "contacted", by: "Dara Sok" }] },
    viewing_confirmation: { kind: "viewing_confirmation", viewing: { ...base, lead_id: base.id, property_id: base.id, agent_id: base.id, scheduled_at: "2026-10-20T02:30:00Z", status: "scheduled", outcome: null, notes: null } as never, customerName: "ស៊ុន សុខា", propertyReference: "PP-R-0001", propertyArea: "BKK1, Chamkar Mon", agentName: "Dara Sok" },
    deal_summary: { kind: "deal_summary", deal, customerName: "ស៊ុន សុខា", landlordName: "Landlord Co", agentName: "Dara Sok", propertyReference: "PP-R-0001", expectedCommissionMinor: 45000 },
    commission_statement: {
      kind: "commission_statement",
      balance: { commission_id: base.id, deal_id: base.id, payer: "landlord", currency: "USD", customer_name: "李明", property_reference: "PP-R-0001", due_minor: 45000, collected_minor: 15000, written_off_minor: 0, outstanding_minor: 30000, due_date: "2026-11-10", collection_status: "partially_paid" } as never,
      entries: [{ ...base, commission_id: base.id, entry_type: "payment", amount_minor: 15000, currency: "USD", occurred_on: "2026-10-21", payment_method: "bank_transfer", reference: "TX-1", reason: null, notes: null, reverses_id: null, recorded_by: base.id } as never],
      staff: { get: () => "Finance Staff" },
    },
    payout_statement: { kind: "payout_statement", deal, customerName: "ស៊ុន សុខា", agentName: "Dara Sok", propertyReference: "PP-R-0001", financials: { agent_share_minor: 18000, agent_eligible_minor: 6000, agent_paid_minor: 0, agent_pending_minor: 0, agent_outstanding_minor: 6000 } as never, payouts: [] },
    landlord_submission: { kind: "landlord_submission", submission: { ...base, submitter_name: "李华", relationship: "owner", phone: "+855 12 000 000", email: null, preferred_language: "zh", property_category: "commercial", property_type: "office", district: "Daun Penh", neighborhood: null, address: "St 51", bedrooms: null, expected_rent_minor: 150000, currency: "USD", description: "办公室", status: "new", internal_notes: null, handled_by: null } as never },
    agreement_draft: { kind: "agreement_draft", deal, customerName: "ស៊ុន សុខា", landlordName: "Landlord Co", agentName: "Dara Sok", propertyReference: "PP-R-0001" },
  };
}

describe("PDF generation", () => {
  const samples = sample();

  for (const type of documentTypes) {
    for (const locale of locales) {
      it(`${type} renders in ${locale}`, async () => {
        const dict = await loadDictionary(effectiveLocale(type, locale));
        const bytes = await renderDocument(samples[type]!, {
          dict,
          locale: effectiveLocale(type, locale),
          reference: "DS-2026-000001",
          issuedAt: NOW,
          preparedBy: "Test Staff",
        });
        expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
        expect(bytes.length).toBeGreaterThan(5_000);

        const { text, pages } = await pdfText(bytes);
        expect(pages).toBeGreaterThanOrEqual(1);
        expect(text).toContain("DS-2026-000001");
        expect(text).toContain("Test Staff");
      }, 30_000);
    }
  }

  it("prints names exactly as recorded, in every document language", async () => {
    for (const locale of locales) {
      const bytes = await renderDocument(samples.deal_summary!, {
        dict: await loadDictionary(locale), locale, reference: "DS-2026-000002", issuedAt: NOW, preparedBy: "Staff",
      });
      const { text } = await pdfText(bytes);
      expect(text, locale).toContain("PP-R-0001");
      expect(text, locale).toContain("Landlord Co");
      // The Khmer customer name is printed (not translated). pdf.js returns
      // Khmer glyphs in visual order, so compare the consonants only.
      const consonants = (s: string) => s.replace(/[^\u1780-\u17A2]/g, "");
      expect(consonants(text), locale).toContain(consonants("ស៊ុនសុខា"));
    }
  }, 30_000);

  it("uses the document's language for labels", async () => {
    const khmer = await pdfText(
      await renderDocument(samples.deal_summary!, { dict: await loadDictionary("km"), locale: "km", reference: "R", issuedAt: NOW, preparedBy: "S" }),
    );
    const chinese = await pdfText(
      await renderDocument(samples.deal_summary!, { dict: await loadDictionary("zh"), locale: "zh", reference: "R", issuedAt: NOW, preparedBy: "S" }),
    );
    const consonants = (s: string) => s.replace(/[^\u1780-\u17A2]/g, "");
    expect(consonants(khmer.text)).toContain(consonants("សេចក្តីសង្ខេប"));
    expect(khmer.text).not.toContain("Deal summary");
    expect(chinese.text.replace(/\s+/g, "")).toContain("租赁交易摘要");
  }, 30_000);

  it("does not leak private fields into a listing sheet", async () => {
    const bytes = await renderDocument(samples.listing_sheet!, {
      dict: await loadDictionary("en"), locale: "en", reference: "LS-2026-000001", issuedAt: NOW, preparedBy: "S",
    });
    const { text } = await pdfText(bytes);
    expect(text).not.toContain("SECRET ADDRESS");
    expect(text).toContain("Bright 2-bedroom condo");
  }, 30_000);

  it("marks the deal summary and statements as non-binding, and the draft as a template", async () => {
    const dict = await loadDictionary("en");
    const ctx = { dict, locale: "en" as Locale, reference: "X-1", issuedAt: NOW, preparedBy: "S" };
    const deal = await pdfText(await renderDocument(samples.deal_summary!, ctx));
    expect(deal.text).toContain("not a rental agreement");
    const statement = await pdfText(await renderDocument(samples.commission_statement!, ctx));
    expect(statement.text).toContain("not a receipt");
    const draft = await pdfText(await renderDocument(samples.agreement_draft!, ctx));
    expect(draft.text).toContain("DRAFT TEMPLATE FOR REVIEW BY QUALIFIED LOCAL COUNSEL");
    expect(draft.text).toContain("[Clause to be drafted by qualified local counsel]");
    expect(draft.text.toLowerCase()).not.toMatch(/signed by|hereby agrees/);
  }, 30_000);

  it("forces the draft agreement into English", () => {
    expect(effectiveLocale("agreement_draft", "km")).toBe("en");
    expect(effectiveLocale("deal_summary", "km")).toBe("km");
  });

  it("names files consistently", () => {
    expect(documentFileName("DS-2026-000012", "km")).toBe("CamRent_DS-2026-000012_km.pdf");
  });
});

describe("fonts", () => {
  it("splits mixed text into per-script runs", () => {
    const runs = splitRuns("Deal សង្ខេប 租赁 USD 900");
    expect(runs.map((r) => r.script)).toEqual(["latin", "khmer", "han", "latin"]);
    expect(runs.map((r) => r.text).join("")).toBe("Deal សង្ខេប 租赁 USD 900");
    expect(dominantScript("សង្ខេប")).toBe("khmer");
    expect(dominantScript("租赁")).toBe("han");
    expect(dominantScript("Deal")).toBe("latin");
  });

  /** Every character a dictionary can print must exist in the font used for it. */
  it.each(locales)("the %s document strings are fully covered by the embedded fonts", async (locale) => {
    const dict = await loadDictionary(locale);
    const strings: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "string") strings.push(value);
      else if (value && typeof value === "object") Object.values(value).forEach(walk);
    };
    for (const part of [dict.ops.docs, dict.ops.documents, dict.crm.stages, dict.fin.dealStages, dict.fin.entryTypes,
      dict.fin.paymentMethods, dict.fin.collection, dict.fin.payoutStatuses, dict.fin.payers, dict.fin.commissionMethods,
      dict.propertyTypes, dict.furnishingOptions, dict.search, dict.property, dict.crm.sources, dict.crm.lead.viewingStatus]) walk(part);

    const open = (file: string) => fontkit.openSync(file) as unknown as { hasGlyphForCodePoint(cp: number): boolean };
    const fonts = {
      latin: open(fontFiles.latin.regular),
      khmer: open(fontFiles.khmer.regular),
      han: open(fontFiles.han.regular),
    };
    const missing = new Set<string>();
    for (const text of strings) {
      for (const run of splitRuns(text.replace(/\{\w+\}/g, ""))) {
        for (const ch of run.text) {
          if (/\s/.test(ch)) continue;
          if (!fonts[run.script].hasGlyphForCodePoint(ch.codePointAt(0)!)) missing.add(`${run.script}:${ch}`);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("ships every font file", () => {
    for (const set of Object.values(fontFiles)) {
      expect(fs.existsSync(set.regular)).toBe(true);
      expect(fs.existsSync(set.bold)).toBe(true);
    }
  });
});
