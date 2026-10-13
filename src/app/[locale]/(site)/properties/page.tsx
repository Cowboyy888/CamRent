import type { Metadata } from "next";
import { Suspense } from "react";
import { ListingsEmptyState } from "@/components/property/listings-empty-state";
import { Pagination } from "@/components/property/pagination";
import { PropertyGrid, PropertyGridSkeleton } from "@/components/property/property-grid";
import { SearchPanel } from "@/components/property/search-panel";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { readSupabasePublicEnv } from "@/config/supabase-env";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatMoney } from "@/lib/format";
import { localeAlternates } from "@/lib/metadata";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import {
  hasActiveFilters,
  parsePropertySearch,
  toSearchQuery,
  type PropertySearchCriteria,
} from "@/lib/validation/property-search";
import { searchProperties, type SearchResult } from "@/server/properties/queries";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return {
    title: dict.properties.title,
    description: dict.properties.intro,
    // Every filter combination shares one canonical URL.
    alternates: localeAlternates(locale, "/properties"),
  };
}

const usd = (dollars: number) => formatMoney({ amountMinor: dollars * 100, currency: "USD" });

/** Human-readable chips for the filters that are applied. */
function describeCriteria(criteria: PropertySearchCriteria, dict: Dictionary): string[] {
  const t = dict.search;
  const parts: string[] = [];
  if (criteria.category) parts.push(t[criteria.category]);
  if (criteria.type) parts.push(dict.propertyTypes[criteria.type]);
  if (criteria.area) parts.push(criteria.area);
  if (criteria.minPrice !== undefined && criteria.maxPrice !== undefined) {
    parts.push(interpolate(t.priceRange, { min: usd(criteria.minPrice), max: usd(criteria.maxPrice) }));
  } else if (criteria.minPrice !== undefined) {
    parts.push(interpolate(t.priceFrom, { price: usd(criteria.minPrice) }));
  } else if (criteria.maxPrice !== undefined) {
    parts.push(interpolate(t.priceUpTo, { price: usd(criteria.maxPrice) }));
  }
  if (criteria.beds) parts.push(dict.bedroomOptions[criteria.beds]);
  if (criteria.baths) parts.push(dict.bathroomOptions[criteria.baths]);
  if (criteria.furnishing) parts.push(dict.furnishingOptions[criteria.furnishing]);
  if (criteria.availability) parts.push(dict.availabilityOptions[criteria.availability]);
  return parts;
}

async function loadResults(
  criteria: PropertySearchCriteria,
  locale: Locale,
): Promise<SearchResult | null> {
  if (!readSupabasePublicEnv().ok) return null;
  try {
    const result = await searchProperties(createSupabasePublicClient(), criteria, locale);
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

/** Reads the query string, so it renders per request behind <Suspense>. */
async function Results({
  searchParams,
  locale,
  dict,
}: {
  searchParams: PageProps<"/[locale]/properties">["searchParams"];
  locale: Locale;
  dict: Dictionary;
}) {
  const criteria = parsePropertySearch(await searchParams);
  const result = await loadResults(criteria, locale);
  const chips = describeCriteria(criteria, dict);
  const base = localizedPath(locale, "/properties");
  const hrefFor = (page: number) => {
    const query = toSearchQuery(criteria, { page });
    return query ? `${base}?${query}` : base;
  };
  const t = dict.properties;

  return (
    <>
      <SearchPanel locale={locale} dict={dict} initial={criteria} extended idPrefix="results-search" />

      {chips.length > 0 ? (
        <section aria-label={dict.search.activeFilters} className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li key={chip}>
                <Badge tone="brand" className="px-3 py-1 text-sm">
                  {chip}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8">
        {result === null ? (
          <div role="alert">
            <ListingsEmptyState
              headingLevel="h2"
              title={t.errorTitle}
              body={t.errorBody}
              ctaLabel={t.tryAgain}
              ctaHref={hrefFor(criteria.page)}
            />
          </div>
        ) : result.total === 0 ? (
          hasActiveFilters(criteria) ? (
            <ListingsEmptyState
              headingLevel="h2"
              title={t.emptyTitle}
              body={t.emptyBody}
              ctaLabel={t.clearFilters}
              ctaHref={base}
            />
          ) : (
            <ListingsEmptyState
              headingLevel="h2"
              title={t.emptyNoneTitle}
              body={t.emptyNoneBody}
              ctaLabel={dict.home.listings.contactCta}
              ctaHref={localizedPath(locale, "/contact")}
            />
          )
        ) : (
          <>
            <p className="mb-5 text-sm font-semibold text-ink-soft" aria-live="polite">
              {result.total === 1
                ? t.resultsOne
                : interpolate(t.resultsMany, { count: result.total })}
            </p>
            <PropertyGrid items={result.items} locale={locale} dict={dict} />
            <Pagination page={result.page} pageCount={result.pageCount} hrefFor={hrefFor} dict={dict} />
          </>
        )}
      </div>
    </>
  );
}

export default async function PropertiesPage({ searchParams }: PageProps<"/[locale]/properties">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);

  return (
    <Container className="py-10 sm:py-14">
      <h1 className="text-3xl font-bold tracking-tight">{dict.properties.title}</h1>
      <p className="mt-2 max-w-2xl text-muted">{dict.properties.intro}</p>
      <div className="mt-6">
        <Suspense fallback={<PropertyGridSkeleton label={dict.properties.loading} />}>
          <Results searchParams={searchParams} locale={locale} dict={dict} />
        </Suspense>
      </div>
    </Container>
  );
}

