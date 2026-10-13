"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { locales, localeMeta, type Locale } from "@/i18n/config";
import { switchLocalePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { setLanguageAction } from "@/server/ops/actions";

function Buttons({ current, label, pathname, search }: { current: Locale; label: string; pathname: string; search: string }) {
  return (
    <ul aria-label={label} className="flex overflow-hidden rounded-control border border-sand-300 bg-white text-sm">
      {locales.map((locale) => {
        const meta = localeMeta[locale];
        const active = locale === current;
        return (
          <li key={locale} className="border-sand-300 not-first:border-l">
            <form action={setLanguageAction}>
              <input type="hidden" name="to" value={locale} />
              <input type="hidden" name="next" value={switchLocalePath(pathname, locale, search)} />
              <button
                type="submit"
                lang={meta.htmlLang}
                title={meta.englishName}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex min-h-11 items-center px-3 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mekong-500 sm:min-h-9",
                  active ? "bg-ink text-white" : "text-ink-soft hover:bg-sand-100",
                )}
              >
                {meta.nativeName}
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}

function WithLocation(props: { current: Locale; label: string }) {
  return <Buttons {...props} pathname={usePathname()} search={useSearchParams().toString()} />;
}

/** CRM language switch: keeps the page and query, and saves the choice to the staff profile. */
export function CrmLanguageSwitch(props: { current: Locale; label: string }) {
  return (
    <Suspense fallback={<Buttons {...props} pathname={`/${props.current}/dashboard`} search="" />}>
      <WithLocation {...props} />
    </Suspense>
  );
}
