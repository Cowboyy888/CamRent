import Link from "next/link";
import { getDictionary, getLocale } from "@/i18n/server";
import { dashboardPath } from "@/server/auth/constants";

export default async function DashboardNotFound() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <div className="max-w-xl">
      <p className="font-display text-sm font-bold text-laterite-600">404</p>
      <h1 className="mt-2 text-2xl font-bold">{dict.notFound.title}</h1>
      <p className="mt-2 text-muted">{dict.notFound.body}</p>
      <Link href={dashboardPath(locale)} className="mt-6 inline-block text-sm font-semibold text-mekong-700 hover:underline">
        {dict.crm.nav.dashboard}
      </Link>
    </div>
  );
}
