import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";

export function Categories({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.categories;
  const base = localizedPath(locale, "/properties");
  const items = [
    { key: "residential", icon: "home" as const, title: t.residentialTitle, body: t.residentialBody },
    { key: "commercial", icon: "area" as const, title: t.commercialTitle, body: t.commercialBody },
  ];

  return (
    <section aria-labelledby="categories-title" className="pt-16 sm:pt-20">
      <Container>
        <h2 id="categories-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.title}
        </h2>
        <p className="mt-2 text-muted">{t.intro}</p>
        <ul className="mt-8 grid gap-5 md:grid-cols-2">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={`${base}?category=${item.key}`}
                className="group flex h-full items-start gap-4 rounded-card border border-sand-200 bg-white p-6 transition-shadow hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mekong-500"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-mekong-50 text-mekong-700">
                  <Icon name={item.icon} className="size-6" />
                </span>
                <span>
                  <span className="block text-lg font-bold">{item.title}</span>
                  <span className="mt-1 block text-[0.9375rem] text-muted">{item.body}</span>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-mekong-700 group-hover:underline">
                    {t.browse} {item.title}
                    <Icon name="arrowRight" className="size-4" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
