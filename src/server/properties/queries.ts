import type { Locale } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";
import type { PublicSupabaseClient } from "@/lib/supabase/public";
import { SEARCH_PAGE_SIZE, type PropertySearchCriteria } from "@/lib/validation/property-search";
import type { PropertyCardData } from "@/types/property";
import {
  pickTranslation,
  toCard,
  toDetail,
  type PublicMediaRow,
  type PublicPhoto,
  type PublicPropertyDetail,
  type PublicProperty,
  type PublicPropertyRow,
  type PublicTranslationRow,
  readProperty,
} from "./model";

/**
 * Public property queries. Every function takes the client as an argument
 * (tests pass their own) and reads only the public_* views, so what is
 * returned is exactly what the database exposes to anonymous visitors.
 */

const MEDIA_BUCKET = "property-media";
const SIGNED_URL_SECONDS = 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID.test(value);

export type QueryResult<T> = { ok: true; data: T } | { ok: false };

export interface SearchResult {
  items: PropertyCardData[];
  total: number;
  /** The page actually returned (clamped to the available range). */
  page: number;
  pageCount: number;
}

/**
 * Free text from the URL goes into a PostgREST `or()` filter, so reduce it
 * to letters, digits, spaces and a few harmless marks. Wildcards, commas and
 * parentheses can never reach the filter syntax.
 */
export function sanitizeAreaTerm(value: string): string {
  return value
    .replace(/[^\p{L}\p{M}\p{N}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

type FilterBuilder<T> = T & {
  eq: (column: string, value: string | number) => T;
  gte: (column: string, value: number) => T;
  lte: (column: string, value: number) => T;
  or: (filter: string) => T;
};

/** Applies the visitor's filters to a public_properties query. */
function applyFilters<Q>(query: Q, criteria: PropertySearchCriteria): Q {
  let q = query as FilterBuilder<Q>;
  if (criteria.category) q = q.eq("category", criteria.category) as FilterBuilder<Q>;
  if (criteria.type) q = q.eq("property_type", criteria.type) as FilterBuilder<Q>;
  if (criteria.area) {
    const term = sanitizeAreaTerm(criteria.area);
    if (term) {
      q = q.or(
        `district.ilike.*${term}*,neighborhood.ilike.*${term}*,city.ilike.*${term}*`,
      ) as FilterBuilder<Q>;
    }
  }
  // Rent filters are in US dollars, so they only match USD-priced listings.
  if (criteria.minPrice !== undefined || criteria.maxPrice !== undefined) {
    q = q.eq("currency", "USD") as FilterBuilder<Q>;
    if (criteria.minPrice !== undefined) {
      q = q.gte("monthly_rent_minor", criteria.minPrice * 100) as FilterBuilder<Q>;
    }
    if (criteria.maxPrice !== undefined) {
      q = q.lte("monthly_rent_minor", criteria.maxPrice * 100) as FilterBuilder<Q>;
    }
  }
  if (criteria.beds) {
    q =
      criteria.beds === "studio"
        ? (q.eq("bedrooms", 0) as FilterBuilder<Q>)
        : criteria.beds === "4+"
          ? (q.gte("bedrooms", 4) as FilterBuilder<Q>)
          : (q.eq("bedrooms", Number(criteria.beds)) as FilterBuilder<Q>);
  }
  if (criteria.baths) {
    q = q.gte("bathrooms", criteria.baths === "3+" ? 3 : Number(criteria.baths)) as FilterBuilder<Q>;
  }
  if (criteria.furnishing) q = q.eq("furnishing_status", criteria.furnishing) as FilterBuilder<Q>;
  if (criteria.availability) {
    q = q.eq("availability_status", criteria.availability) as FilterBuilder<Q>;
  }
  return q as Q;
}

const readRows = (data: unknown): PublicProperty[] =>
  ((data ?? []) as PublicPropertyRow[]).flatMap((row) => {
    const property = readProperty(row);
    return property ? [property] : [];
  });

export const hrefFor = (locale: Locale) => (id: string) =>
  localizedPath(locale, `/properties/${id}`);

/** Signed URLs for a set of storage paths; missing entries are simply absent. */
async function signPaths(
  client: PublicSupabaseClient,
  paths: string[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data, error } = await client.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error || !data) return urls;
  for (const entry of data) {
    if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}

/** Loads translations and cover photos for a page of properties and builds cards. */
async function buildCards(
  client: PublicSupabaseClient,
  rows: PublicProperty[],
  locale: Locale,
): Promise<PropertyCardData[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const [translations, media] = await Promise.all([
    client.from("public_property_translations").select("*").in("property_id", ids),
    client
      .from("public_property_media")
      .select("*")
      .in("property_id", ids)
      .eq("media_type", "image")
      .order("is_cover", { ascending: false })
      .order("display_order", { ascending: true }),
  ]);

  const byProperty = new Map<string, PublicTranslationRow[]>();
  for (const row of (translations.data ?? []) as PublicTranslationRow[]) {
    if (!row.property_id) continue;
    byProperty.set(row.property_id, [...(byProperty.get(row.property_id) ?? []), row]);
  }

  const coverPath = new Map<string, PublicMediaRow>();
  for (const row of (media.data ?? []) as PublicMediaRow[]) {
    // Rows are ordered cover-first, so the first one per property wins.
    if (row.property_id && row.storage_path && !coverPath.has(row.property_id)) {
      coverPath.set(row.property_id, row);
    }
  }
  const signed = await signPaths(
    client,
    [...coverPath.values()].map((row) => row.storage_path as string),
  );

  return rows.map((row) => {
    const translation = pickTranslation(byProperty.get(row.id) ?? [], locale);
    const title = translation?.title ?? null;
    const cover = coverPath.get(row.id);
    const src = cover?.storage_path ? signed.get(cover.storage_path) : undefined;
    return toCard(
      row,
      title,
      src ? { src, alt: cover?.caption || title || row.listing_code } : null,
      hrefFor(locale),
    );
  });
}

/** One page of search results. Only the requested page is read from the database. */
export async function searchProperties(
  client: PublicSupabaseClient,
  criteria: PropertySearchCriteria,
  locale: Locale,
): Promise<QueryResult<SearchResult>> {
  const counted = await applyFilters(
    client.from("public_properties").select("id", { count: "exact", head: true }),
    criteria,
  );
  if (counted.error || counted.count === null) return { ok: false };

  const total = counted.count;
  const pageCount = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));
  const page = Math.min(criteria.page, pageCount);
  if (total === 0) return { ok: true, data: { items: [], total, page: 1, pageCount: 1 } };

  let query = applyFilters(client.from("public_properties").select("*"), criteria);
  if (criteria.sort === "newest") {
    query = query.order("created_at", { ascending: false });
  } else {
    // USD sorts before KHR (enum order), so amounts are only compared
    // within one currency.
    query = query
      .order("currency", { ascending: true })
      .order("monthly_rent_minor", { ascending: criteria.sort === "priceAsc" })
      .order("created_at", { ascending: false });
  }
  const from = (page - 1) * SEARCH_PAGE_SIZE;
  const { data, error } = await query
    .order("id", { ascending: true })
    .range(from, from + SEARCH_PAGE_SIZE - 1);
  if (error || !data) return { ok: false };

  const items = await buildCards(client, readRows(data), locale);
  return { ok: true, data: { items, total, page, pageCount } };
}

/** Newest published listings, for the homepage. */
export async function getLatestProperties(
  client: PublicSupabaseClient,
  locale: Locale,
  limit = 6,
): Promise<QueryResult<PropertyCardData[]>> {
  const { data, error } = await client
    .from("public_properties")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(limit);
  if (error || !data) return { ok: false };
  return { ok: true, data: await buildCards(client, readRows(data), locale) };
}

export type DetailResult =
  | { status: "ok"; property: PublicPropertyDetail }
  | { status: "notFound" }
  | { status: "error" };

/** A single published listing, or "notFound" for unknown or unpublished ids. */
export async function getPropertyDetail(
  client: PublicSupabaseClient,
  id: string,
  locale: Locale,
): Promise<DetailResult> {
  if (!isUuid(id)) return { status: "notFound" };

  const { data: row, error } = await client
    .from("public_properties")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return { status: "error" };
  const property = row ? readProperty(row as PublicPropertyRow) : null;
  if (!property) return { status: "notFound" };

  const [translations, media] = await Promise.all([
    client.from("public_property_translations").select("*").eq("property_id", id),
    client
      .from("public_property_media")
      .select("*")
      .eq("property_id", id)
      .eq("media_type", "image")
      .order("is_cover", { ascending: false })
      .order("display_order", { ascending: true }),
  ]);
  if (translations.error || media.error) return { status: "error" };

  const translation = pickTranslation((translations.data ?? []) as PublicTranslationRow[], locale);
  const mediaRows = ((media.data ?? []) as PublicMediaRow[]).filter((m) => m.storage_path);
  const signed = await signPaths(client, mediaRows.map((m) => m.storage_path as string));
  const photos: PublicPhoto[] = mediaRows.flatMap((m) => {
    const url = signed.get(m.storage_path as string);
    return url && m.id
      ? [{ id: m.id, url, caption: m.caption, isCover: Boolean(m.is_cover) }]
      : [];
  });

  return { status: "ok", property: toDetail(property, translation, photos) };
}

/**
 * Other published listings in the same category, nearest area first.
 * Always excludes the listing itself.
 */
export async function getSimilarProperties(
  client: PublicSupabaseClient,
  property: Pick<PublicPropertyDetail, "id" | "category" | "district">,
  locale: Locale,
  limit = 4,
): Promise<PropertyCardData[]> {
  const base = () =>
    client
      .from("public_properties")
      .select("*")
      .eq("category", property.category)
      .neq("id", property.id)
      .order("created_at", { ascending: false })
      .limit(limit);

  let rows: PublicProperty[] = [];
  if (property.district) {
    const { data } = await base().eq("district", property.district);
    rows = readRows(data);
  }
  if (rows.length < limit) {
    const { data } = await base();
    const seen = new Set(rows.map((row) => row.id));
    for (const row of readRows(data)) {
      if (rows.length >= limit) break;
      if (!seen.has(row.id)) rows.push(row);
    }
  }
  return buildCards(client, rows, locale);
}
