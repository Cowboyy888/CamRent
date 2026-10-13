import type { Metadata } from "next";
import { Suspense } from "react";
import { Categories } from "@/components/home/categories";
import { ContactSection } from "@/components/home/contact-section";
import { Hero } from "@/components/home/hero";
import { LandlordCta } from "@/components/home/landlord-cta";
import { LatestProperties } from "@/components/home/latest-properties";
import { Locations } from "@/components/home/locations";
import { VerificationSteps } from "@/components/home/verification-steps";
import { PropertyGridSkeleton } from "@/components/property/property-grid";
import { Container } from "@/components/ui/container";
import { getDictionary, getLocale } from "@/i18n/server";
import { localeAlternates } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return { alternates: localeAlternates(await getLocale(), "/") };
}

export default async function HomePage() {
  const locale = await getLocale();
  const dict = await getDictionary();

  return (
    <>
      <Hero locale={locale} dict={dict} />

      <section aria-labelledby="listings-title" className="pt-16 sm:pt-20">
        <Container>
          <h2 id="listings-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
            {dict.home.listings.title}
          </h2>
          <div className="mt-8">
            <Suspense fallback={<PropertyGridSkeleton count={3} label={dict.properties.loading} />}>
              <LatestProperties locale={locale} dict={dict} />
            </Suspense>
          </div>
        </Container>
      </section>

      <Categories locale={locale} dict={dict} />
      <Locations locale={locale} dict={dict} />
      <VerificationSteps dict={dict} />
      <LandlordCta locale={locale} dict={dict} />
      <ContactSection locale={locale} dict={dict} />
    </>
  );
}
