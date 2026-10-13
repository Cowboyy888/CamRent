import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { localizedPath } from "@/i18n/paths";
import { getDictionary, getLocale } from "@/i18n/server";

/** Localised 404 inside the site chrome (header, footer, language). */
export default async function LocaleNotFound() {
  const locale = await getLocale();
  const dict = await getDictionary();

  return (
    <Container className="py-20 sm:py-28">
      <p className="font-display text-sm font-bold text-laterite-600">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{dict.notFound.title}</h1>
      <p className="mt-4 max-w-xl text-lg text-muted">{dict.notFound.body}</p>
      <Link href={localizedPath(locale)} className={buttonClasses({ className: "mt-8" })}>
        {dict.common.backToHome}
      </Link>
    </Container>
  );
}
