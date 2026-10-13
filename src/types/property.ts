/**
 * Shared property domain types. Values mirror the blueprint (section 7) so the
 * database schema in Phase 2 can use the same enums.
 */

export const propertyCategories = ["residential", "commercial"] as const;
export type PropertyCategory = (typeof propertyCategories)[number];

export const residentialTypes = [
  "apartment",
  "condo",
  "serviced_apartment",
  "villa",
  "house",
  "flat",
] as const;

export const commercialTypes = [
  "office",
  "retail_shop",
  "shophouse",
  "warehouse",
  "commercial_space",
] as const;

export const propertyTypes = [...residentialTypes, ...commercialTypes] as const;
export type PropertyType = (typeof propertyTypes)[number];

export const propertyTypesByCategory: Record<PropertyCategory, readonly PropertyType[]> = {
  residential: residentialTypes,
  commercial: commercialTypes,
};

export const bedroomOptions = ["studio", "1", "2", "3", "4+"] as const;
export type BedroomOption = (typeof bedroomOptions)[number];

/** Whether a unit can be rented. Separate from publication status. */
export const availabilityStatuses = [
  "available",
  "available_from",
  "reserved",
  "rented",
  "off_market",
] as const;
export type AvailabilityStatus = (typeof availabilityStatuses)[number];

/** Whether a listing is visible on the public website. */
export const publicationStatuses = [
  "draft",
  "submitted",
  "in_review",
  "changes_requested",
  "published",
  "unpublished",
  "archived",
] as const;
export type PublicationStatus = (typeof publicationStatuses)[number];

export const bathroomOptions = ["1", "2", "3+"] as const;
export type BathroomOption = (typeof bathroomOptions)[number];

export const furnishingStatuses = ["fully_furnished", "partially_furnished", "unfurnished"] as const;
export type FurnishingStatus = (typeof furnishingStatuses)[number];

/** Availability states a visitor can filter on (the public views hide the rest). */
export const availabilityFilters = ["available", "available_from"] as const;
export type AvailabilityFilter = (typeof availabilityFilters)[number];

export const sortOptions = ["newest", "priceAsc", "priceDesc"] as const;
export type SortOption = (typeof sortOptions)[number];

export type AreaUnit = "sqm" | "sqft";

export const currencies = ["USD", "KHR"] as const;
export type Currency = (typeof currencies)[number];

/** Money is always an integer amount in minor units (cents) plus a currency. */
export interface Money {
  amountMinor: number;
  currency: Currency;
}

/** Listing reference, e.g. "PP-R-SA-00123" (city-category-type-sequence). */
export type ListingReference = string;

/**
 * The fields a public property card may show. It intentionally excludes
 * private data such as landlord details, unit numbers or exact coordinates,
 * and contains only values that exist in the database.
 */
export interface PropertyCardData {
  reference: ListingReference;
  href: string;
  category: PropertyCategory;
  type: PropertyType;
  /** Null when no translation exists; the card then shows the reference. */
  title: string | null;
  /** "Neighbourhood, District" or the city, from the database. */
  areaName: string;
  rent: Money;
  /** 0 means studio. Residential only. */
  bedrooms: number | null;
  bathrooms: number | null;
  floorArea: { value: number; unit: AreaUnit } | null;
  availability: Extract<AvailabilityStatus, "available" | "available_from" | "reserved">;
  /** ISO date (YYYY-MM-DD) when the unit becomes available. */
  availableFrom: string | null;
  coverImage: { src: string; alt: string } | null;
}
