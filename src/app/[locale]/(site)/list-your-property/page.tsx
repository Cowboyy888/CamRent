import type { Metadata } from "next";
import { LandlordForm } from "@/components/forms/landlord-form";
import { Container } from "@/components/ui/container";
import { getDictionary, getLocale } from "@/i18n/server";
import { localeAlternates } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return {
    title: dict.listProperty.title,
    description: dict.listProperty.intro,
    alternates: localeAlternates(locale, "/list-your-property"),
  };
}

export default async function ListYourPropertyPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.listProperty;
  const steps = [t.steps.one, t.steps.two, t.steps.three];

  return (
    <Container className="py-10 sm:py-14">
      <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t.intro}</p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <section aria-labelledby="steps-title">
          <h2 id="steps-title" className="text-xl font-bold">
            {t.stepsTitle}
          </h2>
          <ol className="mt-5 space-y-5">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-mekong-50 font-display text-sm font-bold text-mekong-700 tabular-nums">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-bold">{step.title}</h3>
                  <p className="mt-1 text-[0.9375rem] text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-panel border border-sand-200 bg-white p-6 shadow-card sm:p-8">
          <LandlordForm locale={locale} dict={dict} />
        </section>
      </div>
    </Container>
  );
}
