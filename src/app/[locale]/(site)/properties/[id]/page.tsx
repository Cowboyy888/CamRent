import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EnquiryForm } from "@/components/forms/enquiry-form";
import { Gallery } from "@/components/property/gallery";
import { ListingsEmptyState } from "@/components/property/listings-empty-state";
import { PropertyGrid } from "@/components/property/property-grid";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import { readSupabasePublicEnv } from "@/config/supabase-env";
import { localeMeta, type Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatArea, formatDate, formatMoney } from "@/lib/format";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { PublicPropertyDetail } from "@/server/properties/model";
import {
  getPropertyDetail,
  getSimilarProperties,
  type DetailResult,
} from "@/server/properties/queries";
import type { PropertyCardData } from "@/types/property";

type Props = PageProps<"/[locale]/properties/[id]">;

async function loadDetail(id: string, locale: Locale): Promise<DetailResult> {
  if (!readSupabasePublicEnv().ok) return { status: "error" };
  try {
    return await getPropertyDetail(createSupabasePublicClient(), id, locale);
  } catch {
    return { status: "error" };
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, locale, dict] = await Promise.all([params, getLocale(), getDictionary()]);
  const result = await loadDetail(id, locale);
  if (result.status !== "ok") {
    return { title: dict.detail.notFoundTitle, robots: { index: false, follow: false } };
  }
  const p = result.property;
  const title = p.title ?? interpolate(dict.property.untitled, { reference: p.reference });
  return {
    title,
    description: p.description?.slice(0, 160) ?? undefined,
    alternates: { canonical: localizedPath(locale, `/properties/${p.id}`) },
  };
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control bg-sand-50 p-3">
      <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-1 font-semibold text-ink">{value}</dd>
    </div>
  );
}

function Facts({ p, dict, locale }: { p: PublicPropertyDetail; dict: Dictionary; locale: Locale }) {
  const t = dict.detail;
  const facts: Array<{ label: string; value: string }> = [
    { label: t.reference, value: p.reference },
    { label: t.category, value: dict.search[p.category] },
    { label: t.type, value: dict.propertyTypes[p.type] },
  ];
  if (p.bedrooms !== null) {
    facts.push({
      label: t.bedrooms,
      value: p.bedrooms === 0 ? dict.property.studio : String(p.bedrooms),
    });
  }
  if (p.bathrooms !== null) facts.push({ label: t.bathrooms, value: String(p.bathrooms) });
  if (p.floorArea) {
    facts.push({ label: t.size, value: formatArea(p.floorArea.value, p.floorArea.unit) });
  }
  if (p.furnishing) {
    facts.push({ label: t.furnishing, value: dict.furnishingOptions[p.furnishing] });
  }
  facts.push({
    label: t.availability,
    value:
      p.availability === "available_from" && p.availableFrom
        ? interpolate(dict.property.availableFrom, { date: formatDate(p.availableFrom, locale) })
        : dict.property.availableNow,
  });
  if (p.deposit) facts.push({ label: t.deposit, value: formatMoney(p.deposit) });

  return (
    <section aria-labelledby="facts-title" className="mt-8">
      <h2 id="facts-title" className="text-xl font-bold">
        {t.keyFacts}
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {facts.map((fact) => (
          <Fact key={fact.label} label={fact.label} value={fact.value} />
        ))}
      </dl>
    </section>
  );
}

function Similar({
  items,
  locale,
  dict,
}: {
  items: PropertyCardData[];
  locale: Locale;
  dict: Dictionary;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="similar-title" className="mt-14">
      <h2 id="similar-title" className="text-2xl font-bold tracking-tight">
        {dict.detail.similar}
      </h2>
      <div className="mt-6">
        <PropertyGrid items={items} locale={locale} dict={dict} columns={4} />
      </div>
    </section>
  );
}

async function Detail({ params, locale, dict }: { params: Props["params"]; locale: Locale; dict: Dictionary }) {
  const { id } = await params;
  const result = await loadDetail(id, locale);
  const t = dict.detail;
  const backHref = localizedPath(locale, "/properties");

  if (result.status !== "ok") {
    const missing = result.status === "notFound";
    return (
      <Container className="py-14">
        <ListingsEmptyState
          headingLevel="h2"
          title={missing ? t.notFoundTitle : t.errorTitle}
          body={missing ? t.notFoundBody : t.errorBody}
          ctaLabel={t.back}
          ctaHref={backHref}
        />
      </Container>
    );
  }

  const p = result.property;
  const title = p.title ?? interpolate(dict.property.untitled, { reference: p.reference });
  const place = [p.neighborhood, p.district, p.city].filter(Boolean).join(", ");
  const photos = p.photos.map((photo) => ({
    id: photo.id,
    url: photo.url,
    alt: photo.caption ?? title,
  }));
  const thumbLabels = photos.map((_, index) =>
    interpolate(t.showPhoto, { n: index + 1, total: photos.length }),
  );

  let similar: PropertyCardData[] = [];
  try {
    similar = await getSimilarProperties(createSupabasePublicClient(), p, locale);
  } catch {
    similar = [];
  }

  const fallbackNotice =
    p.textLocale && p.textLocale !== locale
      ? interpolate(t.translationFallback, { language: localeMeta[p.textLocale].nativeName })
      : null;

  return (
    <Container className="py-8 sm:py-12">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm font-semibold text-mekong-700 hover:underline">
        <Icon name="arrowRight" className="size-4 rotate-180" />
        {t.back}
      </Link>

      <div className="mt-5 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div>
          {photos.length > 0 ? (
            <Gallery photos={photos} label={t.gallery} thumbLabel={thumbLabels} />
          ) : (
            <div className="grid aspect-[16/10] place-items-center rounded-card bg-sand-100 text-muted">
              {dict.property.noPhoto}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Badge tone="brand">{dict.propertyTypes[p.type]}</Badge>
            <Badge tone="neutral">{dict.search[p.category]}</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-muted">
            <Icon name="pin" />
            {place}
          </p>

          <Facts p={p} dict={dict} locale={locale} />

          {p.description ? (
            <section aria-labelledby="about-title" className="mt-8">
              <h2 id="about-title" className="text-xl font-bold">
                {t.about}
              </h2>
              {fallbackNotice ? <p className="mt-2 text-sm text-muted">{fallbackNotice}</p> : null}
              <p className="mt-3 max-w-prose whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-soft">
                {p.description}
              </p>
            </section>
          ) : fallbackNotice ? (
            <p className="mt-6 text-sm text-muted">{fallbackNotice}</p>
          ) : null}

          {p.amenities.length > 0 ? (
            <section aria-labelledby="amenities-title" className="mt-8">
              <h2 id="amenities-title" className="text-xl font-bold">
                {t.amenities}
              </h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {p.amenities.map((amenity) => (
                  <li key={amenity} className="flex items-center gap-2 text-[0.9375rem]">
                    <Icon name="check" className="size-4 text-success" />
                    {amenity}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {p.leaseTerms ? (
            <section aria-labelledby="lease-title" className="mt-8">
              <h2 id="lease-title" className="text-xl font-bold">
                {t.leaseTerms}
              </h2>
              <p className="mt-3 max-w-prose whitespace-pre-line text-[0.9375rem] text-ink-soft">
                {p.leaseTerms}
              </p>
            </section>
          ) : null}
        </div>

        <aside aria-label={t.enquireTitle} className="lg:sticky lg:top-24">
          <div className="rounded-panel border border-sand-200 bg-white p-5 shadow-card">
            <p className="font-display text-3xl font-extrabold tabular-nums">
              {formatMoney(p.rent)}{" "}
              <span className="text-base font-medium text-muted">{dict.property.perMonth}</span>
            </p>
            <p className="mt-1 text-sm font-medium text-success">
              {p.availability === "available_from" && p.availableFrom
                ? interpolate(dict.property.availableFrom, { date: formatDate(p.availableFrom, locale) })
                : dict.property.availableNow}
            </p>
            <p className="mt-1 text-xs text-muted">
              {interpolate(dict.property.reference, { reference: p.reference })}
            </p>

            <h2 className="mt-6 text-lg font-bold">{t.enquireTitle}</h2>
            <p className="mt-1 mb-4 text-sm text-muted">
              {interpolate(t.enquireIntro, { reference: p.reference })}
            </p>
            <EnquiryForm locale={locale} dict={dict} propertyId={p.id} idPrefix="detail-enquiry" />
          </div>
        </aside>
      </div>

      <Similar items={similar} locale={locale} dict={dict} />

      <div className="mt-10">
        <Link href={backHref} className={buttonClasses({ variant: "secondary" })}>
          {t.back}
        </Link>
      </div>
    </Container>
  );
}

export default async function PropertyDetailPage({ params }: Props) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <Suspense fallback={<Container className="py-14"><div className="aspect-[16/10] animate-pulse rounded-card bg-sand-100" /></Container>}>
      <Detail params={params} locale={locale} dict={dict} />
    </Suspense>
  );
}
