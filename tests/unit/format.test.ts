import { describe, expect, it } from "vitest";
import { formatArea, formatDate, formatMoney } from "@/lib/format";

describe("formatMoney", () => {
  it("formats USD from integer cents, identically for every language", () => {
    expect(formatMoney({ amountMinor: 120_000, currency: "USD" })).toBe("USD 1,200");
    expect(formatMoney({ amountMinor: 3_200_000, currency: "USD" })).toBe("USD 32,000");
    expect(formatMoney({ amountMinor: 120_050, currency: "USD" })).toBe("USD 1,200.50");
  });

  it("formats riel in whole units", () => {
    expect(formatMoney({ amountMinor: 490_000_000, currency: "KHR" })).toBe("៛4,900,000");
  });

  it("rejects non-integer minor units", () => {
    expect(() => formatMoney({ amountMinor: 12.5, currency: "USD" })).toThrow();
  });
});

describe("formatArea", () => {
  it("formats square metres", () => {
    expect(formatArea(95)).toBe("95 m²");
    expect(formatArea(1250.5)).toBe("1,250.5 m²");
  });
});

describe("formatDate", () => {
  it("formats in each language with Western digits", () => {
    expect(formatDate("2026-10-10", "en")).toBe("10 Oct 2026");
    expect(formatDate("2026-10-10", "zh")).toContain("2026");
    expect(formatDate("2026-10-10", "zh")).toContain("10");
    const khmer = formatDate("2026-10-10", "km");
    expect(khmer).toContain("2026");
    expect(khmer).not.toMatch(/[០-៩]/); // no Khmer numerals
  });

  it("rejects invalid dates", () => {
    expect(() => formatDate("2026-13-45", "en")).toThrow();
  });
});
