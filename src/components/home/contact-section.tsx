import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";

export function ContactSection({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.home.contact;
  return (
    <section aria-labelledby="contact-title" className="pb-16 sm:pb-20">
      <Container>
        <div className="flex flex-col gap-6 rounded-panel border border-sand-200 bg-white px-6 py-10 sm:px-10 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 id="contact-title" className="text-2xl font-bold tracking-tight">
              {t.title}
            </h2>
            <p className="mt-2 text-muted">{t.body}</p>
          </div>
          <Link
            href={localizedPath(locale, "/contact")}
            className={buttonClasses({ variant: "primary", size: "lg", className: "shrink-0" })}
          >
            {t.cta}
          </Link>
        </div>
      </Container>
    </section>
  );
}
