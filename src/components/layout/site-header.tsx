import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { BrandLogo } from "./brand-logo";
import { LanguageSwitcher } from "./language-switcher";
import { MobileNav } from "./mobile-nav";
import { getPrimaryNav } from "./nav-items";
import { PrimaryNav } from "./primary-nav";

export function SiteHeader({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const items = getPrimaryNav(locale, dict);
  const landlordsHref = localizedPath(locale, "/list-your-property");

  return (
    <header className="sticky top-0 z-40 border-b border-sand-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        {dict.common.skipToContent}
      </a>
      <Container className="relative flex h-16 items-center gap-4 lg:gap-8">
        <Link
          href={localizedPath(locale)}
          aria-label={siteConfig.name}
          className="shrink-0 rounded-control"
        >
          <BrandLogo />
        </Link>

        <PrimaryNav items={items} label={dict.nav.primaryLabel} />

        <div className="ml-auto flex items-center gap-3">
          <LanguageSwitcher
            currentLocale={locale}
            label={dict.common.language}
            className="hidden sm:block"
          />
          {/* Visibility lives on a wrapper: `cn` does not resolve conflicting
              display utilities, so `hidden` must not share an element with the
              button's own `inline-flex`. */}
          <div className="hidden lg:block">
            <Link href={landlordsHref} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              {dict.nav.listProperty}
            </Link>
          </div>
          <MobileNav
            items={items}
            locale={locale}
            listPropertyHref={landlordsHref}
            labels={{
              open: dict.common.openMenu,
              close: dict.common.closeMenu,
              nav: dict.nav.primaryLabel,
              language: dict.common.language,
              listProperty: dict.nav.listProperty,
            }}
          />
        </div>
      </Container>
    </header>
  );
}
