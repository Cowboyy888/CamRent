import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyNote, Panel } from "@/components/crm/panels";
import { DataTable } from "@/components/finance/bits";
import { DocumentForm } from "@/components/ops/document-form";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminAccess } from "@/server/auth/admin-access";
import { dashboardPath } from "@/server/auth/constants";
import { generatableTypes, isDocumentType, type DocumentType } from "@/server/documents/catalog";
import { listEntities, listRecentDocuments } from "@/server/documents/queries";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.ops.documents.title };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Content({
  searchParams,
  locale,
  dict,
}: {
  searchParams: PageProps<"/[locale]/dashboard/documents">["searchParams"];
  locale: Locale;
  dict: Dictionary;
}) {
  const access = await requireAdminAccess();
  const t = dict.ops.documents;
  const available = generatableTypes(access.role);
  const raw = await searchParams;
  const requested = one(raw.type);
  const selected: DocumentType | undefined =
    isDocumentType(requested) && available.includes(requested) ? requested : available[0];
  const entity = one(raw.entity) ?? "";

  const client = await createSupabaseServerClient();
  const [options, recent] = await Promise.all([
    selected ? listEntities(client, selected) : Promise.resolve([]),
    listRecentDocuments(client),
  ]);
  const base = dashboardPath(locale, "/documents");

  return (
    <div className="space-y-6">
      <p className="rounded-control bg-sand-50 p-3 text-sm text-ink-soft">{t.notBinding}</p>

      {available.length === 0 || !selected ? (
        <EmptyNote>{dict.ops.common.forbidden}</EmptyNote>
      ) : (
        <>
          <nav aria-label={t.typeLabel}>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {available.map((type) => (
                <li key={type}>
                  <Link
                    href={`${base}?type=${type}`}
                    aria-current={type === selected ? "true" : undefined}
                    className={cn(
                      "block h-full rounded-card border p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mekong-500",
                      type === selected
                        ? "border-mekong-500 bg-mekong-50"
                        : "border-sand-200 bg-white hover:border-mekong-500",
                    )}
                  >
                    <span className="block font-bold">{t.types[type].name}</span>
                    <span className="mt-1 block text-sm text-muted">{t.types[type].description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <Panel id="generate" title={t.types[selected].name}>
            {options.length === 0 ? (
              <EmptyNote>{t.noRecords}</EmptyNote>
            ) : null}
            <DocumentForm
              key={selected}
              type={selected}
              options={options}
              locale={locale}
              defaultEntity={options.some((o) => o.id === entity) ? entity : ""}
              englishOnly={selected === "agreement_draft"}
              dict={dict}
            />
          </Panel>
        </>
      )}

      <Panel id="recent" title={t.recentTitle}>
        {!recent || recent.length === 0 ? (
          <EmptyNote>{t.noRecent}</EmptyNote>
        ) : (
          <DataTable
            compact
            head={[t.columns.reference, t.columns.type, t.columns.language, t.columns.created, t.columns.by, t.download]}
          >
            {recent.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2 font-semibold whitespace-nowrap">{d.reference}</td>
                <td className="px-4 py-2">{t.types[d.doc_type].name}</td>
                <td className="px-4 py-2">{t.languages[d.locale]}</td>
                <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(d.created_at, locale)}</td>
                <td className="px-4 py-2">{d.by ?? "—"}</td>
                <td className="px-4 py-2">
                  {d.storage_path ? (
                    <Link
                      href={dashboardPath(locale, `/documents/${d.id}/download`)}
                      prefetch={false}
                      className="font-semibold text-mekong-700 hover:underline"
                    >
                      {t.download}
                    </Link>
                  ) : (
                    <span className="text-muted">{t.pending}</span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
    </div>
  );
}

export default async function DocumentsPage({ searchParams }: PageProps<"/[locale]/dashboard/documents">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{dict.ops.documents.title}</h1>
      <p className="mt-1 mb-6 max-w-2xl text-muted">{dict.ops.documents.intro}</p>
      <Suspense fallback={<p className="text-sm text-muted">{dict.ops.common.loading}</p>}>
        <Content searchParams={searchParams} locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}
