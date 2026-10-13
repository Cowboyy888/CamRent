import Link from "next/link";
import { Container } from "@/components/ui/container";
import { siteConfig } from "@/config/site";
import { locales, localeMeta, type Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { BrandLogo } from "./brand-logo";
import { getPrimaryNav } from "./nav-items";

export function SiteFooter({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const [residential, commercial, landlords, about, contact] = getPrimaryNav(locale, dict);
  const columns = [
    { title: dict.footer.explore, items: [residential, commercial, landlords] },
    { title: dict.footer.company, items: [about, contact] },
  ];
  const { contact: details } = siteConfig;
  const contactLines = [details.address, details.phone, details.email].filter(
    (line): line is string => Boolean(line),
  );

  return (
    <footer className="mt-auto bg-ink text-sand-200">
      <Container className="grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <BrandLogo inverse />
          <p className="max-w-xs text-sm text-sand-300">{dict.footer.tagline}</p>
          {contactLines.length > 0 ? (
            <address className="text-sm not-italic text-sand-300">
              {contactLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </address>
          ) : null}
        </div>

        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="text-xs font-semibold tracking-[0.12em] text-mekong-300 uppercase">
              {column.title}
            </h2>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm">
              {column.items.map((item) =>
                item ? (
                  <li key={item.href}>
                    <Link href={item.href} className="hover:text-white hover:underline">
                      {item.label}
                    </Link>
                  </li>
                ) : null,
              )}
            </ul>
          </nav>
        ))}

        <nav aria-label={dict.footer.languages}>
          <h2 className="text-xs font-semibold tracking-[0.12em] text-mekong-300 uppercase">
            {dict.footer.languages}
          </h2>
          <ul className="mt-4 flex flex-col gap-2.5 text-sm">
            {locales.map((code) => (
              <li key={code}>
                <a
                  href={localizedPath(code)}
                  hrefLang={localeMeta[code].htmlLang}
                  lang={localeMeta[code].htmlLang}
                  aria-current={code === locale ? "true" : undefined}
                  className="hover:text-white hover:underline aria-[current=true]:font-semibold aria-[current=true]:text-white"
                >
                  {localeMeta[code].nativeName}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-2 py-6 text-xs text-sand-300 sm:flex-row sm:justify-between">
          <p>
            {interpolate(dict.footer.rights, {
              year: siteConfig.copyrightYear,
              brand: siteConfig.legalName ?? siteConfig.name,
            })}
          </p>
        </Container>
      </div>
    </footer>
  );
}
