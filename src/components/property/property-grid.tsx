import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { PropertyCardData } from "@/types/property";
import { PropertyCard } from "./property-card";

export function PropertyGrid({
  items,
  locale,
  dict,
  columns = 3,
}: {
  items: PropertyCardData[];
  locale: Locale;
  dict: Dictionary;
  columns?: 3 | 4;
}) {
  return (
    <ul
      className={
        columns === 4
          ? "grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
          : "grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
      }
    >
      {items.map((property) => (
        <li key={property.reference} className="flex">
          <div className="flex w-full">
            <PropertyCard property={property} locale={locale} dict={dict} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Placeholder grid shown while listings load. */
export function PropertyGridSkeleton({ count = 6, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-label={label}>
      <ul aria-hidden="true" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <li key={index} className="overflow-hidden rounded-card border border-sand-200 bg-white">
            <div className="aspect-[4/3] animate-pulse bg-sand-100" />
            <div className="space-y-3 p-4">
              <div className="h-5 w-1/3 animate-pulse rounded bg-sand-100" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-sand-100" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-sand-100" />
            </div>
          </li>
        ))}
      </ul>
      <span className="sr-only">{label}</span>
    </div>
  );
}
