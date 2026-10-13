import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";

export interface NavItem {
  href: string;
  label: string;
}

/** Primary public navigation, shared by the header, mobile menu and footer. */
export function getPrimaryNav(locale: Locale, dict: Dictionary): NavItem[] {
  return [
    { href: `${localizedPath(locale, "/properties")}?category=residential`, label: dict.nav.residential },
    { href: `${localizedPath(locale, "/properties")}?category=commercial`, label: dict.nav.commercial },
    { href: localizedPath(locale, "/list-your-property"), label: dict.nav.landlords },
    { href: localizedPath(locale, "/about"), label: dict.nav.about },
    { href: localizedPath(locale, "/contact"), label: dict.nav.contact },
  ];
}
