"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { locales, localeMeta, type Locale } from "@/i18n/config";
import { localizedPath, switchLocalePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";

interface LanguageSwitcherProps {
  currentLocale: Locale;
  label: string;
  className?: string;
}

/**
 * Links to the same page in each language, keeping the query string.
 * Plain <a> elements (full page load) so <html lang> and the per-language
 * fonts always match the new language.
 */
function LanguageLinks({
  currentLocale,
  label,
  className,
  search,
  pathname,
}: LanguageSwitcherProps & { search: string; pathname: string }) {
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex overflow-hidden rounded-control border border-sand-300 bg-white text-sm">
        {locales.map((locale) => {
          const active = locale === currentLocale;
          const meta = localeMeta[locale];
          return (
            <li key={locale} className="border-sand-300 not-first:border-l">
              <a
                href={switchLocalePath(pathname, locale, search)}
                hrefLang={meta.htmlLang}
                lang={meta.htmlLang}
                aria-current={active ? "true" : undefined}
                title={meta.englishName}
                className={cn(
                  "flex min-h-11 items-center px-3 font-medium transition-colors sm:min-h-9",
                  active ? "bg-ink text-white" : "text-ink-soft hover:bg-sand-100",
                )}
              >
                {meta.nativeName}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function WithLocation(props: LanguageSwitcherProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  return <LanguageLinks {...props} pathname={pathname} search={searchParams.toString()} />;
}

export function LanguageSwitcher(props: LanguageSwitcherProps) {
  // The path and query string are per-request on dynamic routes, so they are
  // read behind a Suspense boundary; the fallback links to each language's
  // home page until the real location is known.
  return (
    <Suspense
      fallback={<LanguageLinks {...props} pathname={localizedPath(props.currentLocale)} search="" />}
    >
      <WithLocation {...props} />
    </Suspense>
  );
}
