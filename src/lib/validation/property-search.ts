import { z } from "zod";
import {
  availabilityFilters,
  bathroomOptions,
  bedroomOptions,
  furnishingStatuses,
  propertyCategories,
  propertyTypes,
  propertyTypesByCategory,
  sortOptions,
  type AvailabilityFilter,
  type BathroomOption,
  type BedroomOption,
  type FurnishingStatus,
  type PropertyCategory,
  type PropertyType,
  type SortOption,
} from "@/types/property";

/** Highest monthly rent (USD) accepted in a search filter. */
export const MAX_SEARCH_PRICE_USD = 1_000_000;
export const SEARCH_PAGE_SIZE = 12;
/** Pages beyond this are treated as the first page (stops absurd offsets). */
export const MAX_SEARCH_PAGE = 1000;

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const price = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(0).max(MAX_SEARCH_PRICE_USD).optional(),
);

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(emptyToUndefined, z.enum(values).optional()).catch(undefined);

/**
 * Search filters as they appear in the URL (`?category=residential&beds=2`).
 * Invalid values are dropped instead of failing, so a mistyped or outdated
 * link still opens the search page.
 */
const searchParamsSchema = z.object({
  category: optionalEnum(propertyCategories),
  type: optionalEnum(propertyTypes),
  area: z
    .preprocess(emptyToUndefined, z.string().trim().max(80).optional())
    .catch(undefined),
  minPrice: price.catch(undefined),
  maxPrice: price.catch(undefined),
  beds: optionalEnum(bedroomOptions),
  baths: optionalEnum(bathroomOptions),
  furnishing: optionalEnum(furnishingStatuses),
  availability: optionalEnum(availabilityFilters),
  sort: z.enum(sortOptions).catch("newest"),
  page: z.coerce.number().int().min(1).max(MAX_SEARCH_PAGE).catch(1),
});

export interface PropertySearchCriteria {
  /** Absent means "residential and commercial". */
  category?: PropertyCategory;
  type?: PropertyType;
  area?: string;
  /** Whole US dollars per month. */
  minPrice?: number;
  /** Whole US dollars per month. */
  maxPrice?: number;
  beds?: BedroomOption;
  baths?: BathroomOption;
  furnishing?: FurnishingStatus;
  availability?: AvailabilityFilter;
  sort: SortOption;
  /** 1-based. */
  page: number;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export function parsePropertySearch(raw: RawSearchParams): PropertySearchCriteria {
  const parsed = searchParamsSchema.parse({
    category: firstValue(raw.category),
    type: firstValue(raw.type),
    area: firstValue(raw.area),
    minPrice: firstValue(raw.minPrice),
    maxPrice: firstValue(raw.maxPrice),
    beds: firstValue(raw.beds),
    baths: firstValue(raw.baths),
    furnishing: firstValue(raw.furnishing),
    availability: firstValue(raw.availability),
    sort: firstValue(raw.sort),
    page: firstValue(raw.page),
  });

  const criteria: PropertySearchCriteria = { sort: parsed.sort, page: parsed.page };
  if (parsed.category) criteria.category = parsed.category;
  if (parsed.type) {
    // A type that contradicts the chosen category is dropped.
    if (!parsed.category || propertyTypesByCategory[parsed.category].includes(parsed.type)) {
      criteria.type = parsed.type;
    }
  }
  if (parsed.area) criteria.area = parsed.area;
  if (parsed.minPrice !== undefined) criteria.minPrice = parsed.minPrice;
  if (parsed.maxPrice !== undefined) criteria.maxPrice = parsed.maxPrice;
  if (
    criteria.minPrice !== undefined &&
    criteria.maxPrice !== undefined &&
    criteria.minPrice > criteria.maxPrice
  ) {
    [criteria.minPrice, criteria.maxPrice] = [criteria.maxPrice, criteria.minPrice];
  }
  // Bedrooms only apply to homes.
  if (parsed.beds && parsed.category !== "commercial") criteria.beds = parsed.beds;
  if (parsed.baths) criteria.baths = parsed.baths;
  if (parsed.furnishing) criteria.furnishing = parsed.furnishing;
  if (parsed.availability) criteria.availability = parsed.availability;
  return criteria;
}

/**
 * Serialises criteria back into a stable query string (without "?").
 * Defaults (newest first, page 1) are left out so shared links stay short.
 */
export function toSearchQuery(
  criteria: PropertySearchCriteria,
  overrides: Partial<Pick<PropertySearchCriteria, "page">> = {},
): string {
  const merged = { ...criteria, ...overrides };
  const params = new URLSearchParams();
  if (merged.category) params.set("category", merged.category);
  if (merged.type) params.set("type", merged.type);
  if (merged.area) params.set("area", merged.area);
  if (merged.minPrice !== undefined) params.set("minPrice", String(merged.minPrice));
  if (merged.maxPrice !== undefined) params.set("maxPrice", String(merged.maxPrice));
  if (merged.beds) params.set("beds", merged.beds);
  if (merged.baths) params.set("baths", merged.baths);
  if (merged.furnishing) params.set("furnishing", merged.furnishing);
  if (merged.availability) params.set("availability", merged.availability);
  if (merged.sort !== "newest") params.set("sort", merged.sort);
  if (merged.page > 1) params.set("page", String(merged.page));
  return params.toString();
}

/** True when any filter (not just sort/page) is applied. */
export function hasActiveFilters(criteria: PropertySearchCriteria): boolean {
  return Boolean(
    criteria.category ||
      criteria.type ||
      criteria.area ||
      criteria.minPrice !== undefined ||
      criteria.maxPrice !== undefined ||
      criteria.beds ||
      criteria.baths ||
      criteria.furnishing ||
      criteria.availability,
  );
}
