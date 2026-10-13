import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getDictionary, getLocale } from "@/i18n/server";

/** Public website chrome: header, main content, footer. */
export default async function SiteLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await getLocale();
  const dict = await getDictionary();

  return (
    <>
      <SiteHeader locale={locale} dict={dict} />
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
        {children}
      </main>
      <SiteFooter locale={locale} dict={dict} />
    </>
  );
}
