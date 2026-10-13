import { Container } from "@/components/ui/container";
import { Icon, type IconName } from "@/components/ui/icon";
import { SearchPanel } from "@/components/property/search-panel";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { Skyline } from "./skyline";

export function Hero({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.home;
  const trust: Array<{ icon: IconName; label: string }> = [
    { icon: "shield", label: t.trust.visited },
    { icon: "clock", label: t.trust.rechecked },
    { icon: "chat", label: t.trust.languages },
  ];

  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-ink">
      <Skyline className="absolute inset-0 -z-20 h-full w-full" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink/90 via-ink/70 to-ink/20 max-lg:bg-gradient-to-b max-lg:from-ink/85 max-lg:via-ink/75 max-lg:to-ink/90" />

      <Container className="pt-14 pb-10 sm:pt-20 lg:pt-24 lg:pb-16">
        <div className="max-w-2xl text-white">
          <p className="text-sm font-semibold tracking-[0.14em] text-mekong-300 uppercase">
            {t.eyebrow}
          </p>
          <h1 id="hero-title" className="mt-3 text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl">
            {t.title}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-sand-200">{t.subtitle}</p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-sand-100">
            {trust.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <Icon name={item.icon} className="size-4 text-mekong-300" />
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        <SearchPanel locale={locale} dict={dict} idPrefix="hero-search" className="mt-10 lg:mt-14" />
      </Container>
    </section>
  );
}
