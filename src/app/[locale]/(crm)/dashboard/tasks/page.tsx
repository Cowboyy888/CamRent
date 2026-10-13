import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyNote } from "@/components/crm/panels";
import { DataTable } from "@/components/finance/bits";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatDateTime } from "@/lib/format";
import { isTaskStatus, taskStatuses, type TaskStatus } from "@/lib/ops/constants";
import { canSeeAllTasks } from "@/lib/ops/permissions";
import { cn } from "@/lib/cn";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminAccess } from "@/server/auth/admin-access";
import { dashboardPath } from "@/server/auth/constants";
import { updateTaskStatusAction } from "@/server/ops/actions";
import { listTasks } from "@/server/ops/queries";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.ops.tasks.title };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const priorityTone: Record<string, BadgeTone> = { low: "neutral", normal: "neutral", high: "warning", urgent: "danger" };

const nextActions: Record<TaskStatus, Array<[TaskStatus, "start" | "complete" | "cancel" | "reopen"]>> = {
  todo: [["in_progress", "start"], ["done", "complete"], ["cancelled", "cancel"]],
  in_progress: [["done", "complete"], ["cancelled", "cancel"]],
  done: [["todo", "reopen"]],
  cancelled: [["todo", "reopen"]],
};

async function Content({
  searchParams,
  locale,
  dict,
}: {
  searchParams: PageProps<"/[locale]/dashboard/tasks">["searchParams"];
  locale: Locale;
  dict: Dictionary;
}) {
  const access = await requireAdminAccess();
  const t = dict.ops.tasks;
  const raw = await searchParams;
  const seeAll = canSeeAllTasks(access.role);
  const scope = seeAll && one(raw.scope) === "all" ? "all" : "mine";
  const statusParam = one(raw.status);
  const status = isTaskStatus(statusParam) ? statusParam : statusParam === "all" ? "all" : "open";
  const notice = one(raw.notice);

  const client = await createSupabaseServerClient();
  const result = await listTasks(client, { userId: access.userId, scope, status });
  const now = new Date().getTime();
  const base = dashboardPath(locale, "/tasks");
  const query = (next: Record<string, string>) => {
    const p = new URLSearchParams({ scope, status, ...next });
    return `${base}?${p.toString()}`;
  };
  const here = `${base}?scope=${scope}&status=${status}`;

  if (!result.ok) {
    return <p role="alert" className="text-sm text-danger">{dict.ops.common.errorBody}</p>;
  }
  const tasks = result.data;
  const overdueCount = tasks.filter(
    (x) => x.dueAt && Date.parse(x.dueAt) < now && (x.status === "todo" || x.status === "in_progress"),
  ).length;

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-11 items-center rounded-control border px-3 text-sm font-semibold sm:min-h-9",
      active ? "border-mekong-700 bg-mekong-50 text-mekong-800" : "border-sand-300 bg-white text-ink-soft hover:bg-sand-100",
    );

  return (
    <div className="space-y-4">
      {notice === "error" ? (
        <p role="alert" className="rounded-control bg-danger-50 p-3 text-sm text-danger">{t.updateFailed}</p>
      ) : null}
      {overdueCount > 0 ? (
        <p role="status" className="rounded-control bg-warning-50 p-3 text-sm font-semibold text-warning">
          {overdueCount === 1 ? t.overdueBannerOne : interpolate(t.overdueBanner, { count: String(overdueCount) })}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {seeAll ? (
          <>
            <Link href={query({ scope: "mine" })} className={chip(scope === "mine")}>{t.scopeMine}</Link>
            <Link href={query({ scope: "all" })} className={chip(scope === "all")}>{t.scopeAll}</Link>
            <span className="mx-1 h-6 w-px bg-sand-300" aria-hidden="true" />
          </>
        ) : null}
        <Link href={query({ status: "open" })} className={chip(status === "open")}>{t.open}</Link>
        {taskStatuses.map((s) => (
          <Link key={s} href={query({ status: s })} className={chip(status === s)}>{t.statuses[s]}</Link>
        ))}
        <Link href={query({ status: "all" })} className={chip(status === "all")}>{t.allStatuses}</Link>
      </div>

      {tasks.length === 0 ? (
        <div>
          <p className="font-semibold">{t.empty}</p>
          <EmptyNote>{t.emptyBody}</EmptyNote>
        </div>
      ) : (
        <DataTable head={[t.columns.task, t.columns.related, t.columns.due, t.columns.priority, t.columns.status, ...(scope === "all" ? [t.columns.assignee] : []), ""]}>
          {tasks.map((task) => {
            const title =
              task.source && task.source in t.sources
                ? t.sources[task.source as keyof typeof t.sources]
                : task.title;
            const open = task.status === "todo" || task.status === "in_progress";
            const overdue = open && task.dueAt !== null && Date.parse(task.dueAt) < now;
            return (
              <tr key={task.id} className="align-top">
                <td className="px-4 py-3 font-semibold">
                  {title}
                  {task.source ? <Badge className="ml-2">{t.automatic}</Badge> : null}
                </td>
                <td className="px-4 py-3">
                  {task.leadId ? (
                    <Link href={dashboardPath(locale, `/leads/${task.leadId}`)} className="text-mekong-700 hover:underline">
                      {task.leadName ?? t.relatedLead}
                    </Link>
                  ) : task.dealId ? (
                    <Link href={dashboardPath(locale, `/deals/${task.dealId}`)} className="text-mekong-700 hover:underline">
                      {t.relatedDeal}
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {task.dueAt ? formatDateTime(task.dueAt, locale) : <span className="text-muted">{t.noDue}</span>}
                  {overdue ? <Badge tone="danger" className="ml-2">{t.overdue}</Badge> : null}
                </td>
                <td className="px-4 py-3"><Badge tone={priorityTone[task.priority] ?? "neutral"}>{t.priorities[task.priority]}</Badge></td>
                <td className="px-4 py-3">{t.statuses[task.status]}</td>
                {scope === "all" ? <td className="px-4 py-3">{task.assigneeName ?? dict.crm.common.unassigned}</td> : null}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {nextActions[task.status].map(([to, label]) => (
                      <form key={to} action={updateTaskStatusAction}>
                        <input type="hidden" name="id" value={task.id} />
                        <input type="hidden" name="status" value={to} />
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="next" value={here} />
                        <Button type="submit" variant="secondary" size="sm">{t.actions[label]}</Button>
                      </form>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}

export default async function TasksPage({ searchParams }: PageProps<"/[locale]/dashboard/tasks">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{dict.ops.tasks.title}</h1>
      <p className="mt-1 mb-6 max-w-2xl text-muted">{dict.ops.tasks.intro}</p>
      <Suspense fallback={<p className="text-sm text-muted">{dict.ops.common.loading}</p>}>
        <Content searchParams={searchParams} locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}
