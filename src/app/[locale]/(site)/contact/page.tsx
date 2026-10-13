import type { Metadata } from "next";
import { EnquiryForm } from "@/components/forms/enquiry-form";
import { Container } from "@/components/ui/container";
import { siteConfig } from "@/config/site";
import { getDictionary, getLocale } from "@/i18n/server";
import { localeAlternates } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return {
    title: dict.contactPage.title,
    description: dict.contactPage.intro,
    alternates: localeAlternates(locale, "/contact"),
  };
}

export default async function ContactPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.contactPage;
  const { contact } = siteConfig;
  const details = [
    { label: t.phone, value: contact.phone },
    { label: t.email, value: contact.email },
    { label: t.telegram, value: contact.telegram },
    { label: t.address, value: contact.address },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  return (
    <Container className="py-10 sm:py-14">
      <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t.intro}</p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.2fr]">
        <section aria-labelledby="details-title">
          <h2 id="details-title" className="text-xl font-bold">
            {t.detailsTitle}
          </h2>
          {details.length > 0 ? (
            <dl className="mt-4 space-y-3">
              {details.map((item) => (
                <div key={item.label}>
                  <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
                    {item.label}
                  </dt>
                  <dd className="mt-0.5 font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-muted">{t.detailsPending}</p>
          )}
        </section>

        <section
          aria-labelledby="form-title"
          className="rounded-panel border border-sand-200 bg-white p-6 shadow-card"
        >
          <h2 id="form-title" className="text-xl font-bold">
            {t.formTitle}
          </h2>
          <div className="mt-4">
            <EnquiryForm locale={locale} dict={dict} idPrefix="contact" />
          </div>
        </section>
      </div>
    </Container>
  );
}
