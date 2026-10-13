import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Panel } from "@/components/crm/panels";
import { Amount, DataTable, ExpenseBadge, Pager } from "@/components/finance/bits";
import { ExpenseActions, ExpenseForm } from "@/components/finance/fin-forms";
import { ListingsEmptyState } from "@/components/property/listings-empty-state";
import { buttonClasses } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { canApprove, canMarkPayoutPaid, canViewExpenses } from "@/lib/finance/permissions";
import { formatDate } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPath } from "@/server/auth/constants";
import { requireCapability } from "@/server/finance/guard";
import { listExpenses, signedLink } from "@/server/finance/queries";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.fin.expenses.title };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const categories = ["advertising", "transportation", "office_rent", "staff_costs", "marketing_materials", "utilities", "other"] as const;
const statuses = ["pending", "approved", "rejected"] as const;
const date = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

async function Content({
  searchParams,
  locale,
  dict,
}: {
  searchParams: PageProps<"/[locale]/dashboard/expenses">["searchParams"];
  locale: Locale;
  dict: Dictionary;
}) {
  const access = await requireCapability(canViewExpenses);
  const raw = await searchParams;
  const f = {
    status: statuses.find((s) => s === one(raw.status)),
    category: categories.find((c) => c === one(raw.category)),
    from: date(one(raw.from)),
    to: date(one(raw.to)),
    page: Math.max(1, Math.min(1000, Number(one(raw.page)) || 1)),
  };
  const client = await createSupabaseServerClient();
  const result = await listExpenses(client, f);
  const links = result.ok ? await Promise.all(result.data.items.map((e) => signedLink(client, e.receipt_path))) : [];
  const base = dashboardPath(locale, "/expenses");
  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v && k !== "page") params.set(k, String(v));
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const t = dict.fin.expenses;

  return (
    <div className="space-y-6">
      <Panel id="new-expense" title={t.new}>
        <ExpenseForm locale={locale} dict={dict} />
      </Panel>

      <form action={base} method="get" className="rounded-card border border-sand-200 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="ef-status" label={dict.fin.common.status}>
            <Select id="ef-status" name="status" defaultValue={f.status ?? ""}>
              <option value="">{dict.fin.common.anyStatus}</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{dict.fin.expenseStatuses[s]}</option>
              ))}
            </Select>
          </Field>
          <Field id="ef-cat" label={t.filterCategory}>
            <Select id="ef-cat" name="category" defaultValue={f.category ?? ""}>
              <option value="">{t.anyCategory}</option>
              {categories.map((c) => (
                <option key={c} value={c}>{dict.fin.expenseCategories[c]}</option>
              ))}
            </Select>
          </Field>
          <Field id="ef-from" label={dict.fin.common.from}>
            <Input id="ef-from" name="from" type="date" defaultValue={f.from ?? ""} />
          </Field>
          <Field id="ef-to" label={dict.fin.common.to}>
            <Input id="ef-to" name="to" type="date" defaultValue={f.to ?? ""} />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="submit" className={buttonClasses({})}>{dict.fin.common.search}</button>
          <Link href={base} className="text-sm font-semibold text-mekong-700 hover:underline">{dict.fin.common.clear}</Link>
        </div>
      </form>

      {!result.ok ? (
        <div role="alert">
          <ListingsEmptyState headingLevel="h2" title={dict.fin.common.errorTitle} body={dict.fin.common.errorBody} />
        </div>
      ) : result.data.total === 0 ? (
        <ListingsEmptyState headingLevel="h2" title={t.emptyTitle} body={t.emptyBody} />
      ) : (
        <>
          <DataTable
            head={[t.columns.date, t.columns.category, t.columns.description, t.columns.amount, t.columns.status, t.columns.paid, t.columns.receipt, dict.fin.common.view]}
          >
            {result.data.items.map((e, i) => (
              <tr key={e.id} className="align-top hover:bg-sand-50">
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(e.expense_date, locale)}</td>
                <td className="px-4 py-3">{dict.fin.expenseCategories[e.category]}</td>
                <td className="px-4 py-3">
                  {e.description}
                  <span className="block text-xs text-muted">
                    {e.vendor ? `${e.vendor} · ` : ""}
                    {e.createdByName ?? ""}
                  </span>
                </td>
                <td className="px-4 py-3"><Amount minor={Number(e.amount_minor)} currency={e.currency} /></td>
                <td className="px-4 py-3">
                  <ExpenseBadge status={e.status} dict={dict} />
                  {e.rejection_reason ? <span className="mt-1 block text-xs text-muted">{e.rejection_reason}</span> : null}
                </td>
                <td className="px-4 py-3">{e.paid_on ? formatDate(e.paid_on, locale) : "—"}</td>
                <td className="px-4 py-3">
                  {links[i] ? (
                    <a href={links[i]!} target="_blank" rel="noopener noreferrer" className="font-semibold text-mekong-700 hover:underline">
                      {t.openReceipt}
                    </a>
                  ) : (
                    <span className="text-muted">{t.noReceipt}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <ExpenseActions
                    id={e.id}
                    status={e.status}
                    paidOn={e.paid_on}
                    hasReceipt={Boolean(e.receipt_path)}
                    locale={locale}
                    dict={dict}
                    canApprove={canApprove(access.role)}
                    canPay={canMarkPayoutPaid(access.role) || canApprove(access.role)}
                  />
                </td>
              </tr>
            ))}
          </DataTable>
          <Pager page={result.data.page} pageCount={result.data.pageCount} hrefFor={hrefFor} dict={dict} />
        </>
      )}
    </div>
  );
}

export default async function ExpensesPage({ searchParams }: PageProps<"/[locale]/dashboard/expenses">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{dict.fin.expenses.title}</h1>
      <p className="mt-1 mb-6 max-w-2xl text-muted">{dict.fin.expenses.intro}</p>
      <Suspense fallback={<p className="text-sm text-muted">{dict.fin.common.loading}</p>}>
        <Content searchParams={searchParams} locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}
