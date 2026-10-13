import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { formatArea, formatDate, formatMoney } from "@/lib/format";
import type { PropertyCardData } from "@/types/property";

/**
 * Public listing card ("facts before marketing": price, key facts,
 * availability). Every value comes from the database; a field that is not
 * set is left out rather than guessed.
 */
export function PropertyCard({
  property,
  locale,
  dict,
}: {
  property: PropertyCardData;
  locale: Locale;
  dict: Dictionary;
}) {
  const t = dict.property;
  const reserved = property.availability === "reserved";
  const availability = reserved
    ? t.reserved
    : property.availability === "available_from" && property.availableFrom
      ? interpolate(t.availableFrom, { date: formatDate(property.availableFrom, locale) })
      : t.availableNow;
  const title = property.title ?? interpolate(t.untitled, { reference: property.reference });

  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-card border border-sand-200 bg-white transition-shadow hover:shadow-card">
      <div className="relative aspect-[4/3] bg-sand-100">
        {property.coverImage ? (
          // Signed URLs change on every request, so the image optimiser could
          // never cache them: serve them as they are.
          <Image
            src={property.coverImage.src}
            alt={property.coverImage.alt}
            fill
            unoptimized
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted">{t.noPhoto}</div>
        )}
        <Badge tone="neutral" className="absolute top-3 left-3 bg-white/95">
          {dict.propertyTypes[property.type]}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="font-display text-lg font-bold tabular-nums">
          {formatMoney(property.rent)}{" "}
          <span className="text-sm font-medium text-muted">{t.perMonth}</span>
        </p>
        <h3 className="truncate text-[0.9375rem] font-semibold">
          <Link href={property.href} className="after:absolute after:inset-0">
            {title}
          </Link>
        </h3>
        <p className="flex items-center gap-1 text-sm text-muted">
          <Icon name="pin" />
          {property.areaName}
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-soft">
          {property.bedrooms !== null ? (
            <li className="flex items-center gap-1">
              <Icon name="bed" />
              {property.bedrooms === 0
                ? t.studio
                : interpolate(t.bedrooms, { count: property.bedrooms })}
            </li>
          ) : null}
          {property.bathrooms !== null ? (
            <li className="flex items-center gap-1">
              <Icon name="bath" />
              {interpolate(t.bathrooms, { count: property.bathrooms })}
            </li>
          ) : null}
          {property.floorArea ? (
            <li className="flex items-center gap-1">
              <Icon name="area" />
              {formatArea(property.floorArea.value, property.floorArea.unit)}
            </li>
          ) : null}
        </ul>
        <p className={reserved ? "mt-1 text-sm font-medium text-warning" : "mt-1 text-sm font-medium text-success"}>
          {availability}
        </p>
        <p className="mt-auto pt-2 text-xs text-muted">
          {interpolate(t.reference, { reference: property.reference })}
        </p>
      </div>
    </article>
  );
}
