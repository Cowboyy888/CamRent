import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";

/**
 * Previous / next links with the current position. Plain links keep every
 * page a real URL: shareable, crawlable and working without JavaScript.
 */
export function Pagination({
  page,
  pageCount,
  hrefFor,
  dict,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  dict: Dictionary;
}) {
  if (pageCount <= 1) return null;
  const t = dict.properties;
  const disabled = "pointer-events-none opacity-50";

  return (
    <nav aria-label={t.pagination} className="mt-10 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link
          href={hrefFor(page - 1)}
          rel="prev"
          className={buttonClasses({ variant: "secondary" })}
        >
          {t.previous}
        </Link>
      ) : (
        <span aria-disabled="true" className={buttonClasses({ variant: "secondary", className: disabled })}>
          {t.previous}
        </span>
      )}
      <p className="text-sm font-medium text-ink-soft tabular-nums">
        {interpolate(t.page, { page, total: pageCount })}
      </p>
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} rel="next" className={buttonClasses({ variant: "secondary" })}>
          {t.next}
        </Link>
      ) : (
        <span aria-disabled="true" className={buttonClasses({ variant: "secondary", className: disabled })}>
          {t.next}
        </span>
      )}
    </nav>
  );
}
