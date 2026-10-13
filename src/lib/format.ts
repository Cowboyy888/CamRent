import type { Locale } from "@/i18n/config";
import type { Money } from "@/types/property";

/**
 * Money is formatted identically in every language ("USD 1,200") so prices
 * never differ between translations. Only surrounding labels are translated.
 */
const wholeNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const twoDecimals = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(money: Money): string {
  if (!Number.isInteger(money.amountMinor)) {
    throw new Error(`Money amounts must be integer minor units, got ${money.amountMinor}`);
  }
  const major = money.amountMinor / 100;
  if (money.currency === "KHR") {
    // Riel is quoted in whole units in practice.
    return `៛${wholeNumber.format(Math.round(major))}`;
  }
  const hasCents = money.amountMinor % 100 !== 0;
  return `USD ${(hasCents ? twoDecimals : wholeNumber).format(major)}`;
}

export function formatArea(value: number, unit: "sqm" | "sqft" = "sqm"): string {
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
  return unit === "sqft" ? `${formatted} sq ft` : `${formatted} m²`;
}

const dateLocales: Record<Locale, string> = {
  en: "en-GB",
  km: "km-KH",
  zh: "zh-CN",
};

/** Formats an ISO date (YYYY-MM-DD) for display, e.g. "10 Oct 2026". */
export function formatDate(isoDate: string, locale: Locale): string {
  const date = new Date(`${isoDate}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ISO date: ${isoDate}`);
  return new Intl.DateTimeFormat(dateLocales[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Phnom_Penh",
    numberingSystem: "latn",
  }).format(date);
}

/** Date and time of an ISO instant in Phnom Penh time, e.g. "13 Oct 2026, 09:30". */
export function formatDateTime(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ISO timestamp: ${iso}`);
  return new Intl.DateTimeFormat(dateLocales[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Phnom_Penh",
    numberingSystem: "latn",
  }).format(date);
}
