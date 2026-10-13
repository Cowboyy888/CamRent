import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";

export function LandlordCta({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.home.landlords;
  return (
    <section aria-labelledby="landlord-cta-title" className="pb-16 sm:pb-20">
      <Container>
        <div className="flex flex-col gap-6 rounded-panel bg-mekong-700 px-6 py-10 text-white sm:px-10 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 id="landlord-cta-title" className="text-2xl font-bold tracking-tight">
              {t.title}
            </h2>
            <p className="mt-2 text-mekong-50">{t.body}</p>
          </div>
          <Link
            href={localizedPath(locale, "/list-your-property")}
            className={buttonClasses({ variant: "inverse", size: "lg", className: "shrink-0" })}
          >
            {t.cta}
            <Icon name="arrowRight" className="size-5" />
          </Link>
        </div>
      </Container>
    </section>
  );
}
