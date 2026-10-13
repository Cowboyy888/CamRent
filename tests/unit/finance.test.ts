import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/finance/csv";
import {
  activeDealStages,
  allowedTransitions,
  displayStage,
  missingForClosedWon,
} from "@/lib/finance/deals";
import { mapDatabaseError } from "@/lib/finance/errors";
import {
  agentEligible,
  collectionStatus,
  expectedAgentShare,
  expectedCommission,
  leaseMonths,
  minorToMajorString,
  outstandingBalance,
  parseMajorToMinor,
  parsePercentScaled,
  percentOf,
} from "@/lib/finance/money";
import { canApprove, canExport, canMarkPayoutPaid, canRecordCollections } from "@/lib/finance/permissions";

describe("money parsing", () => {
  it("parses decimal amounts without floating point", () => {
    expect(parseMajorToMinor("1,250.50")).toBe(125050);
    expect(parseMajorToMinor("0.1")).toBe(10);
    expect(parseMajorToMinor("19.99")).toBe(1999);
    expect(parseMajorToMinor("100")).toBe(10000);
  });
  it("rejects negatives, text and too many decimals", () => {
    for (const bad of ["-5", "abc", "1.234", "", "1e5", "12.", ".5"]) {
      expect(parseMajorToMinor(bad), bad).toBeNull();
    }
  });
  it("round-trips for form fields", () => {
    expect(minorToMajorString(125050)).toBe("1250.50");
    expect(minorToMajorString(90000)).toBe("900");
    expect(minorToMajorString(null)).toBe("");
  });
});

describe("commission calculation (mirrors the database)", () => {
  it("fixed and custom amounts", () => {
    expect(expectedCommission({ method: "fixed_amount", fixedMinor: 25000 }, null, null)).toBe(25000);
    expect(expectedCommission({ method: "custom_amount", fixedMinor: 12345 }, null, null)).toBe(12345);
  });
  it("percentage of one month's rent with half-up rounding", () => {
    const calc = (rate: string, rent: number) =>
      expectedCommission({ method: "percent_of_monthly_rent", rate }, rent, null);
    expect(calc("50", 90000)).toBe(45000);
    expect(calc("33.3333", 100000)).toBe(33333);
    expect(calc("50", 1001)).toBe(501); // 500.5 rounds up
    expect(calc("12.5", 10001)).toBe(1250); // 1250.125
  });
  it("percentage of total contracted rent", () => {
    expect(
      expectedCommission({ method: "percent_of_total_rent", rate: "10" }, 90000, 12),
    ).toBe(108000);
    expect(expectedCommission({ method: "percent_of_total_rent", rate: "10" }, 90000, null)).toBeNull();
  });
  it("is null when not enough is known", () => {
    expect(expectedCommission({ method: "percent_of_monthly_rent", rate: "5" }, null, null)).toBeNull();
    expect(expectedCommission({ method: "fixed_amount" }, 1, 1)).toBeNull();
  });
  it("handles very large amounts exactly", () => {
    // 7.5 % of USD 9,999,999,999.99 (in cents) is not representable safely as a float product.
    expect(percentOf(999_999_999_999, "7.5")).toBe(74_999_999_999 + 1); // 74999999999.925 -> .925 rounds up
  });
  it("parses percentages strictly", () => {
    expect(parsePercentScaled("100")).toBe(1_000_000n);
    expect(parsePercentScaled("100.0001")).toBeNull();
    expect(parsePercentScaled("-1")).toBeNull();
    expect(parsePercentScaled("1.23456")).toBeNull();
  });
  it("counts whole lease months", () => {
    expect(leaseMonths("2031-01-01", "2031-12-31")).toBe(12);
    expect(leaseMonths("2031-01-15", "2031-02-14")).toBe(1);
    expect(leaseMonths("2031-01-01", "2031-01-20")).toBeNull();
    expect(leaseMonths("2031-01-31", "2032-01-30")).toBe(12);
    expect(leaseMonths("2031-03-01", "2031-02-01")).toBeNull();
  });
  it("splits the agent's share from the agency commission", () => {
    expect(expectedAgentShare({ method: "none" }, 90000)).toBe(0);
    expect(expectedAgentShare({ method: "percent_of_commission", rate: "40" }, 90000)).toBe(36000);
    expect(expectedAgentShare({ method: "fixed_amount", fixedMinor: 15000 }, 90000)).toBe(15000);
    expect(expectedAgentShare({ method: "percent_of_commission", rate: "40" }, null)).toBeNull();
  });
});

describe("balances and statuses", () => {
  it("computes outstanding from amounts, never below zero", () => {
    expect(
      outstandingBalance({ agreedMinor: 40000, adjustmentMinor: 5000, collectedMinor: 20000, writtenOffMinor: 0 }),
    ).toBe(25000);
    expect(
      outstandingBalance({ agreedMinor: 100, adjustmentMinor: 0, collectedMinor: 100, writtenOffMinor: 50 }),
    ).toBe(0);
  });
  it("derives the collection status from balances and the due date", () => {
    const base = { collectedMinor: 0, writtenOffMinor: 0, today: "2026-10-14" };
    expect(collectionStatus({ ...base, outstandingMinor: 100, dueDate: null })).toBe("not_due");
    expect(collectionStatus({ ...base, outstandingMinor: 100, dueDate: "2026-10-20" })).toBe("not_due");
    expect(collectionStatus({ ...base, outstandingMinor: 100, dueDate: "2026-10-14" })).toBe("due");
    expect(collectionStatus({ ...base, outstandingMinor: 100, dueDate: "2026-10-13" })).toBe("overdue");
    expect(collectionStatus({ ...base, collectedMinor: 10, outstandingMinor: 90, dueDate: null })).toBe("partially_paid");
    expect(collectionStatus({ ...base, collectedMinor: 100, outstandingMinor: 0, dueDate: "2026-01-01" })).toBe("paid");
    expect(collectionStatus({ ...base, writtenOffMinor: 100, outstandingMinor: 0, dueDate: null })).toBe("written_off");
  });
  it("makes the agent's share eligible by the configured rule", () => {
    const base = { shareMinor: 36000, commissionMinor: 90000, closed: true };
    expect(agentEligible({ ...base, rule: "on_collected", collectedMinor: 0 })).toBe(0);
    expect(agentEligible({ ...base, rule: "on_collected", collectedMinor: 30000 })).toBe(12000);
    expect(agentEligible({ ...base, rule: "on_collected", collectedMinor: 120000 })).toBe(36000);
    expect(agentEligible({ ...base, rule: "on_earned", collectedMinor: 0 })).toBe(36000);
    expect(agentEligible({ ...base, closed: false, rule: "on_earned", collectedMinor: 0 })).toBe(0);
  });
});

describe("deal statuses", () => {
  it("allows only the documented transitions", () => {
    expect(allowedTransitions("negotiation")).toContain("agreement_pending");
    expect(allowedTransitions("negotiation")).not.toContain("closed_won");
    expect(allowedTransitions("agreement_pending")).toContain("closed_won");
    expect(allowedTransitions("closed_won")).toEqual(["lease_expired", "cancelled"]);
    expect(allowedTransitions("lease_expired")).toEqual([]);
  });
  it("lists what is missing before closing as won", () => {
    expect(
      missingForClosedWon({
        agreedMonthlyRentMinor: 90000, leaseStart: "2031-01-01", leaseEnd: "2031-12-31",
        landlordId: "x", closingDate: "2031-01-01", agreementReference: "A",
        commissionMethod: "fixed_amount", commissionExpectedMinor: 1,
      }),
    ).toEqual([]);
    expect(
      missingForClosedWon({
        agreedMonthlyRentMinor: null, leaseStart: null, leaseEnd: null, landlordId: null,
        closingDate: null, agreementReference: " ", commissionMethod: null, commissionExpectedMinor: null,
      }),
    ).toEqual(["rent", "leaseStart", "leaseEnd", "landlord", "closingDate", "agreementReference", "commission"]);
  });
  it("maps legacy statuses and counts closed-won as active", () => {
    expect(displayStage("lease_signed")).toBe("closed_won");
    expect(displayStage("lost")).toBe("closed_lost");
    expect(activeDealStages).toContain("closed_won");
  });
});

describe("permissions", () => {
  it("separates recording money, approving and paying", () => {
    expect(canRecordCollections("finance")).toBe(true);
    expect(canRecordCollections("manager")).toBe(false);
    expect(canApprove("manager")).toBe(true);
    expect(canApprove("finance")).toBe(false);
    expect(canMarkPayoutPaid("manager")).toBe(false);
    expect(canMarkPayoutPaid("finance")).toBe(true);
  });
  it("limits CSV exports by role", () => {
    expect(canExport("marketing", "deals")).toBe(false);
    expect(canExport("agent", "expenses")).toBe(false);
    expect(canExport("agent", "payouts")).toBe(true);
    expect(canExport("manager", "payments")).toBe(false);
    expect(canExport("finance", "payments")).toBe(true);
  });
});

describe("csv", () => {
  it("quotes cells and neutralises spreadsheet formulas", () => {
    expect(csvCell('He said "hi", ok')).toBe('"He said ""hi"", ok"');
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+855 12 345")).toBe("'+855 12 345");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(null)).toBe("");
  });
  it("writes a header and rows with a BOM", () => {
    expect(toCsv(["a", "b"], [{ a: 1, b: "x" }])).toBe("﻿a,b\r\n1,x\r\n");
  });
});

describe("database error mapping", () => {
  it("turns database rejections into codes", () => {
    expect(mapDatabaseError({ code: "23514", message: 'violates check constraint "rental_deals_won_needs_terms"' })).toBe("incompleteDeal");
    expect(mapDatabaseError({ code: "23514", message: "payment (5) exceeds the outstanding balance (3)" })).toBe("exceedsOutstanding");
    expect(mapDatabaseError({ code: "23514", message: "payout (5) exceeds the amount still eligible (3)" })).toBe("exceedsEligible");
    expect(mapDatabaseError({ code: "23505", message: 'duplicate key value violates unique constraint "rental_deals_one_active_per_transaction"' })).toBe("duplicateDeal");
    expect(mapDatabaseError({ code: "23P01", message: 'conflicting key value violates exclusion constraint "rental_deals_no_overlapping_leases"' })).toBe("leaseOverlap");
    expect(mapDatabaseError({ code: "42501", message: "permission denied" })).toBe("forbidden");
    expect(mapDatabaseError({ message: "boom" })).toBe("unexpected");
  });
});

import { checkUpload, safeFileName } from "@/server/finance/files";
import {
  arrangementProblems,
  createDealSchema,
  expenseSchema,
  ledgerSchema,
  termsColumns,
} from "@/server/finance/schemas";

describe("finance form validation", () => {
  const dealBase = {
    leadId: "40000000-0000-0000-0000-000000000011",
    rent: "900",
    currency: "USD",
    commissionMethod: "percent_of_monthly_rent",
    commissionRate: "50",
  };

  it("turns amounts into exact minor units and keeps the arrangement per method", () => {
    const parsed = createDealSchema.parse({ ...dealBase, shareMethod: "percent_of_commission", shareRate: "40" });
    expect(parsed.rent).toBe(90000);
    const cols = termsColumns(parsed);
    expect(cols).toMatchObject({
      agreed_monthly_rent_minor: 90000,
      commission_method: "percent_of_monthly_rent",
      commission_rate: 50,
      commission_fixed_minor: null,
      agent_share_method: "percent_of_commission",
      agent_share_rate: 40,
    });
  });

  it("flags arrangement fields that do not fit their method", () => {
    const missingRate = createDealSchema.parse({ ...dealBase, commissionRate: "" });
    expect(arrangementProblems(missingRate)).toContain("commissionRate");
    const missingFixed = createDealSchema.parse({ ...dealBase, commissionMethod: "fixed_amount", commissionRate: "" });
    expect(arrangementProblems(missingFixed)).toContain("commissionFixed");
    const shareWithoutCommission = createDealSchema.parse({
      leadId: dealBase.leadId, rent: "900", currency: "USD", shareMethod: "fixed_amount", shareFixed: "10",
    });
    expect(arrangementProblems(shareWithoutCommission)).toContain("commissionMethod");
    const reversed = createDealSchema.parse({ ...dealBase, leaseStart: "2031-02-01", leaseEnd: "2031-01-01" });
    expect(arrangementProblems(reversed)).toContain("leaseEnd");
  });

  it("rejects malformed money and percentages", () => {
    expect(createDealSchema.safeParse({ ...dealBase, rent: "9o0" }).success).toBe(false);
    expect(createDealSchema.safeParse({ ...dealBase, rent: "-1" }).success).toBe(false);
    expect(createDealSchema.safeParse({ ...dealBase, commissionRate: "150" }).success).toBe(false);
    expect(createDealSchema.safeParse({ ...dealBase, currency: "EUR" }).success).toBe(false);
  });

  it("requires a positive amount and a real date for ledger entries and expenses", () => {
    const entry = {
      commissionId: "60000000-0000-0000-0000-000000000011",
      entryType: "payment",
      amount: "100.50",
      occurredOn: "2026-10-14",
      method: "cash",
    };
    expect(ledgerSchema.parse(entry).amount).toBe(10050);
    expect(ledgerSchema.safeParse({ ...entry, amount: "0" }).success).toBe(false);
    expect(ledgerSchema.safeParse({ ...entry, amount: "-5" }).success).toBe(false);
    expect(ledgerSchema.safeParse({ ...entry, entryType: "refund" }).success).toBe(false);
    expect(expenseSchema.safeParse({ date: "14/10/2026", category: "other", description: "x", amount: "1", currency: "USD" }).success).toBe(false);
    expect(expenseSchema.safeParse({ date: "2026-10-14", category: "other", description: " ", amount: "1", currency: "USD" }).success).toBe(false);
  });
});

describe("uploads", () => {
  const file = (name: string, type: string, size = 100) => new File([new Uint8Array(size)], name, { type });
  it("accepts PDF, JPG and PNG within the size limit", () => {
    expect(checkUpload(file("receipt.pdf", "application/pdf"))).toBeNull();
    expect(checkUpload(file("photo.JPG", "image/jpeg"))).toBeNull();
  });
  it("rejects empty, oversized and mismatched files", () => {
    expect(checkUpload(null)).toBe("noFile");
    expect(checkUpload(file("a.pdf", "application/pdf", 0))).toBe("noFile");
    expect(checkUpload(file("a.pdf", "application/pdf", 5 * 1024 * 1024))).toBe("fileTooLarge");
    expect(checkUpload(file("a.exe", "application/x-msdownload"))).toBe("fileType");
    expect(checkUpload(file("a.pdf", "image/png"))).toBe("fileType");
  });
  it("makes file names storage-safe", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("My receipt (1).pdf")).toBe("My_receipt_1_.pdf");
  });
});
