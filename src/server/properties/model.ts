import type { Locale } from "@/i18n/config";
import type { Database } from "@/types/database";
import type {
  AreaUnit,
  AvailabilityStatus,
  FurnishingStatus,
  Money,
  PropertyCardData,
} from "@/types/property";

/** Rows of the public views (see supabase/migrations). */
export type PublicPropertyRow = Database["public"]["Views"]["public_properties"]["Row"];
export type PublicTranslationRow =
  Database["public"]["Views"]["public_property_translations"]["Row"];
export type PublicMediaRow = Database["public"]["Views"]["public_property_media"]["Row"];

/**
 * A row of public_properties with the required columns proven non-null.
 * Postgres views report every column as nullable, so rows are checked once
 * here and a malformed row is skipped rather than rendered half-empty.
 */
export interface PublicProperty {
  id: string;
  listing_code: string;
  category: PropertyCardData["category"];
  property_type: PropertyCardData["type"];
  city: string;
  district: string | null;
  neighborhood: string | null;
  monthly_rent_minor: number;
  currency: Money["currency"];
  bedrooms: number | null;
  bathrooms: number | null;
  floor_area: number | null;
  area_unit: AreaUnit;
  furnishing_status: FurnishingStatus | null;
  deposit_amount_minor: number | null;
  lease_terms: string | null;
  availability_status: "available" | "available_from";
  available_from: string | null;
}

export function readProperty(row: PublicPropertyRow): PublicProperty | null {
  const rent = toNumber(row.monthly_rent_minor);
  if (
    !row.id ||
    !row.listing_code ||
    !row.category ||
    !row.property_type ||
    !row.city ||
    !row.currency ||
    rent === null ||
    (row.availability_status !== "available" && row.availability_status !== "available_from")
  ) {
    return null;
  }
  return {
    id: row.id,
    listing_code: row.listing_code,
    category: row.category,
    property_type: row.property_type,
    city: row.city,
    district: row.district,
    neighborhood: row.neighborhood,
    monthly_rent_minor: rent,
    currency: row.currency,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    floor_area: toNumber(row.floor_area),
    area_unit: row.area_unit ?? "sqm",
    furnishing_status: row.furnishing_status,
    deposit_amount_minor: toNumber(row.deposit_amount_minor),
    lease_terms: row.lease_terms,
    availability_status: row.availability_status,
    available_from: row.available_from,
  };
}

export interface PublicPhoto {
  id: string;
  url: string;
  caption: string | null;
  isCover: boolean;
}

export interface PublicPropertyDetail {
  id: string;
  reference: string;
  category: PropertyCardData["category"];
  type: PropertyCardData["type"];
  title: string | null;
  description: string | null;
  amenities: string[];
  /** Locale the text actually came from; differs from the page locale on fallback. */
  textLocale: Locale | null;
  city: string;
  district: string | null;
  neighborhood: string | null;
  rent: Money;
  deposit: Money | null;
  leaseTerms: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floorArea: { value: number; unit: AreaUnit } | null;
  furnishing: FurnishingStatus | null;
  availability: Extract<AvailabilityStatus, "available" | "available_from">;
  availableFrom: string | null;
  photos: PublicPhoto[];
}

const FALLBACK_ORDER: Locale[] = ["en", "km", "zh"];

/**
 * Picks the translation for the visitor's language, then English, then any
 * other. Never fabricates text: with no translation the result is null.
 */
export function pickTranslation<T extends { locale: string | null }>(
  translations: T[],
  locale: Locale,
): T | null {
  const order = [locale, ...FALLBACK_ORDER.filter((code) => code !== locale)];
  for (const code of order) {
    const match = translations.find((t) => t.locale === code);
    if (match) return match;
  }
  return null;
}

export function areaName(row: Pick<PublicProperty, "neighborhood" | "district" | "city">): string {
  const parts = [row.neighborhood, row.district].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : row.city;
}

/** numeric columns arrive as numbers from PostgREST, but be strict about it. */
function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toMoney(amount: number | string, currency: Money["currency"]): Money {
  const minor = toNumber(amount);
  if (minor === null || !Number.isInteger(minor)) {
    throw new Error("Invalid money amount in database row");
  }
  return { amountMinor: minor, currency };
}

export function toCard(
  row: PublicProperty,
  title: string | null,
  cover: { src: string; alt: string } | null,
  hrefFor: (id: string) => string,
): PropertyCardData {
  const area = row.floor_area;
  return {
    reference: row.listing_code,
    href: hrefFor(row.id),
    category: row.category,
    type: row.property_type,
    title,
    areaName: areaName(row),
    rent: toMoney(row.monthly_rent_minor, row.currency),
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    floorArea: area === null ? null : { value: area, unit: row.area_unit },
    availability: row.availability_status,
    availableFrom: row.available_from,
    coverImage: cover,
  };
}

/** Maps rows already filtered by the public views; the status guard is defensive. */
export function toDetail(
  row: PublicProperty,
  translation: PublicTranslationRow | null,
  photos: PublicPhoto[],
): PublicPropertyDetail {
  const area = row.floor_area;
  const deposit = row.deposit_amount_minor;
  return {
    id: row.id,
    reference: row.listing_code,
    category: row.category,
    type: row.property_type,
    title: translation?.title ?? null,
    description: translation?.description?.trim() ? translation.description : null,
    amenities: translation?.amenities ?? [],
    textLocale: (translation?.locale as Locale | undefined) ?? null,
    city: row.city,
    district: row.district,
    neighborhood: row.neighborhood,
    rent: toMoney(row.monthly_rent_minor, row.currency),
    deposit: deposit === null ? null : toMoney(deposit, row.currency),
    leaseTerms: row.lease_terms?.trim() ? row.lease_terms : null,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    floorArea: area === null ? null : { value: area, unit: row.area_unit },
    furnishing: row.furnishing_status,
    availability: row.availability_status,
    availableFrom: row.available_from,
    photos,
  };
}
