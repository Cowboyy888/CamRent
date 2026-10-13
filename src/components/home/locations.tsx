import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";

/**
 * Reference list of Phnom Penh districts. `term` is what the search matches
 * against the district/neighbourhood text of real listings; no counts or
 * prices are shown, so nothing here depends on (or invents) inventory.
 */
export const popularLocations = [
  { key: "chamkarMon", term: "Chamkar" },
  { key: "daunPenh", term: "Daun Penh" },
  { key: "toulKork", term: "Toul Kork" },
  { key: "sevenMakara", term: "7 Makara" },
  { key: "senSok", term: "Sen Sok" },
  { key: "chroyChangvar", term: "Chroy Changvar" },
  { key: "meanChey", term: "Mean Chey" },
  { key: "russeyKeo", term: "Russey Keo" },
] as const;

export function Locations({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.locations;
  const base = localizedPath(locale, "/properties");

  return (
    <section aria-labelledby="locations-title" className="pt-16 sm:pt-20">
      <Container>
        <h2 id="locations-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.title}
        </h2>
        <p className="mt-2 text-muted">{t.intro}</p>
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {popularLocations.map((location) => {
            const name = t.names[location.key];
            return (
              <li key={location.key}>
                <Link
                  href={`${base}?area=${encodeURIComponent(location.term)}`}
                  aria-label={interpolate(t.view, { name })}
                  className="flex min-h-14 items-center gap-2 rounded-card border border-sand-200 bg-white px-4 py-3 font-semibold transition-colors hover:border-mekong-500 hover:text-mekong-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mekong-500"
                >
                  <Icon name="pin" className="size-4 shrink-0 text-laterite-600" />
                  {name}
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
