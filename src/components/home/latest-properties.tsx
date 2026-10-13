import Link from "next/link";
import { ListingsEmptyState } from "@/components/property/listings-empty-state";
import { PropertyGrid } from "@/components/property/property-grid";
import { buttonClasses } from "@/components/ui/button";
import { readSupabasePublicEnv } from "@/config/supabase-env";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { getLatestProperties } from "@/server/properties/queries";

/** Newest published listings, straight from the database (or an honest empty state). */
export async function LatestProperties({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.home.listings;
  let items = null;
  if (readSupabasePublicEnv().ok) {
    try {
      const result = await getLatestProperties(createSupabasePublicClient(), locale, 6);
      items = result.ok ? result.data : null;
    } catch {
      items = null;
    }
  }

  if (!items || items.length === 0) {
    return (
      <ListingsEmptyState
        title={t.emptyTitle}
        body={t.emptyBody}
        ctaLabel={t.contactCta}
        ctaHref={localizedPath(locale, "/contact")}
      />
    );
  }

  return (
    <>
      <PropertyGrid items={items} locale={locale} dict={dict} />
      <div className="mt-8 text-center">
        <Link href={localizedPath(locale, "/properties")} className={buttonClasses({ variant: "secondary", size: "lg" })}>
          {t.viewAll}
        </Link>
      </div>
    </>
  );
}
