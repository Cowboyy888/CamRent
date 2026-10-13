/**
 * Brand and business settings, kept in one place.
 *
 * Rename the agency here: `name` is used for metadata, accessible labels and
 * copyright text; `wordmark` is the same name split into two parts for the
 * two-tone logo (a test checks they stay in sync).
 *
 * Contact details are deliberately `null` until real ones are confirmed:
 * components hide any field that is not set, so we never publish placeholders.
 */
export const siteConfig = {
  name: "CamRent",
  wordmark: ["Cam", "Rent"] as const,
  /** Registered company name, shown in the footer once confirmed. */
  legalName: null as string | null,
  primaryCity: "Phnom Penh",
  /** First year of operation, used in the copyright line. */
  copyrightYear: 2026,
  contact: {
    phone: null as string | null,
    email: null as string | null,
    telegram: null as string | null,
    address: null as string | null,
  },
} as const;

export type SiteConfig = typeof siteConfig;
