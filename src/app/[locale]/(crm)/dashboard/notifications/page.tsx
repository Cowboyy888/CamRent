import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyNote, Panel } from "@/components/crm/panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatDateTime } from "@/lib/format";
import { entityPath, notificationTypes } from "@/lib/ops/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminAccess } from "@/server/auth/admin-access";
import { dashboardPath } from "@/server/auth/constants";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  saveNotificationPreferencesAction,
} from "@/server/ops/actions";
import { listNotifications, loadDisabledTypes } from "@/server/ops/queries";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.ops.notifications.title };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Content({
  searchParams,
  locale,
  dict,
}: {
  searchParams: PageProps<"/[locale]/dashboard/notifications">["searchParams"];
  locale: Locale;
  dict: Dictionary;
}) {
  await requireAdminAccess();
  const t = dict.ops.notifications;
  const notice = one((await searchParams).notice);
  const client = await createSupabaseServerClient();
  const [result, disabled] = await Promise.all([listNotifications(client), loadDisabledTypes(client)]);
  const here = dashboardPath(locale, "/notifications");

  if (!result.ok) {
    return (
      <p role="alert" className="text-sm text-danger">
        {dict.ops.common.errorBody}
      </p>
    );
  }
  const items = result.data;
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-6">
      {notice === "saved" ? (
        <p role="status" className="rounded-control bg-success-50 p-3 text-sm text-success">
          {dict.ops.common.saved}
        </p>
      ) : notice === "error" ? (
        <p role="alert" className="rounded-control bg-danger-50 p-3 text-sm text-danger">
          {dict.ops.common.unexpected}
        </p>
      ) : null}

      <Panel
        id="inbox"
        title={unread > 0 ? interpolate(t.unread, { count: String(unread) }) : t.allRead}
        action={
          unread > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="next" value={here} />
              <Button type="submit" variant="secondary" size="sm">
                {t.markAllRead}
              </Button>
            </form>
          ) : null
        }
      >
        {items.length === 0 ? (
          <EmptyNote>{t.empty}</EmptyNote>
        ) : (
          <ul className="divide-y divide-sand-200">
            {items.map((n) => (
              <li key={n.id} data-read={n.readAt ? "true" : "false"} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className={n.readAt ? "text-ink-soft" : "font-semibold"}>
                    {!n.readAt ? <Badge tone="info" className="mr-2">{t.mark}</Badge> : null}
                    {t.types[n.type]}
                  </p>
                  <p className="text-xs text-muted">
                    {t.entities[n.entityType]}
                    {n.label ? `: ${n.label}` : ""} · {formatDateTime(n.createdAt, locale)}
                  </p>
                </div>
                <Link
                  href={dashboardPath(locale, entityPath(n.entityType, n.entityId))}
                  className="text-sm font-semibold text-mekong-700 hover:underline"
                >
                  {t.open}
                </Link>
                {!n.readAt ? (
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="next" value={here} />
                    <Button type="submit" variant="ghost" size="sm">
                      {t.markRead}
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel id="preferences" title={t.preferencesTitle}>
        <p className="mb-4 text-sm text-muted">{t.preferencesIntro}</p>
        <form action={saveNotificationPreferencesAction} className="space-y-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="next" value={here} />
          <ul className="grid gap-2 sm:grid-cols-2">
            {notificationTypes.map((type) => (
              <li key={type}>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    name={`type:${type}`}
                    defaultChecked={!disabled.has(type)}
                    className="size-5 accent-mekong-700"
                  />
                  {t.types[type]}
                </label>
              </li>
            ))}
          </ul>
          <Button type="submit">{t.preferencesSave}</Button>
        </form>
      </Panel>
    </div>
  );
}

export default async function NotificationsPage({ searchParams }: PageProps<"/[locale]/dashboard/notifications">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{dict.ops.notifications.title}</h1>
      <p className="mt-1 mb-6 max-w-2xl text-muted">{dict.ops.notifications.intro}</p>
      <Suspense fallback={<p className="text-sm text-muted">{dict.ops.common.loading}</p>}>
        <Content searchParams={searchParams} locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}
