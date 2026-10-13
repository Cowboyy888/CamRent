import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyNote, Panel } from "@/components/crm/panels";
import { DataTable } from "@/components/finance/bits";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatDateTime } from "@/lib/format";
import { ruleSettings } from "@/lib/ops/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/server/auth/admin-access";
import { dashboardPath } from "@/server/auth/constants";
import {
  retryAutomationEventAction,
  runAutomationNowAction,
  saveAutomationRuleAction,
} from "@/server/ops/actions";
import { loadAutomation } from "@/server/ops/queries";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.ops.automation.title };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const runTone: Record<string, BadgeTone> = {
  succeeded: "success",
  partial: "warning",
  failed: "danger",
  running: "info",
  skipped: "neutral",
};

async function Content({
  searchParams,
  locale,
  dict,
}: {
  searchParams: PageProps<"/[locale]/dashboard/settings/automation">["searchParams"];
  locale: Locale;
  dict: Dictionary;
}) {
  await requireRole("super_admin", "manager");
  const t = dict.ops.automation;
  const notice = one((await searchParams).notice);
  const client = await createSupabaseServerClient();
  const result = await loadAutomation(client);
  if (!result.ok) return <p role="alert" className="text-sm text-danger">{dict.ops.common.errorBody}</p>;
  const { rules, runs, failed, lastScheduledAt } = result.data;
  const here = dashboardPath(locale, "/settings/automation");
  const noticeText: Record<string, [string, boolean]> = {
    saved: [t.ruleSaved, true],
    ran: [t.ranOk, true],
    retried: [t.retried, true],
    invalid: [t.invalidValue, false],
    error: [t.actionFailed, false],
  };
  const shown = notice ? noticeText[notice] : undefined;

  return (
    <div className="space-y-6">
      {shown ? (
        <p
          role={shown[1] ? "status" : "alert"}
          className={shown[1] ? "rounded-control bg-success-50 p-3 text-sm text-success" : "rounded-control bg-danger-50 p-3 text-sm text-danger"}
        >
          {shown[0]}
        </p>
      ) : null}

      <Panel
        id="schedule"
        title={t.scheduleTitle}
        action={
          <form action={runAutomationNowAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="next" value={here} />
            <Button type="submit" variant="secondary" size="sm">{t.runNow}</Button>
          </form>
        }
      >
        <p className="text-sm text-ink-soft">
          {interpolate(t.scheduleBody, { when: lastScheduledAt ? formatDateTime(lastScheduledAt, locale) : dict.ops.common.never })}
        </p>
      </Panel>

      <Panel id="rules" title={t.rulesTitle}>
        <ul className="divide-y divide-sand-200">
          {rules.map((rule) => {
            const copy = t.rules[rule.code as keyof typeof t.rules];
            const fields = ruleSettings[rule.code] ?? [];
            return (
              <li key={rule.code} className="py-4" data-rule={rule.code}>
                <form action={saveAutomationRuleAction} className="space-y-3">
                  <input type="hidden" name="code" value={rule.code} />
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="next" value={here} />
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold">{copy?.name ?? rule.code}</h3>
                      <p className="text-sm text-muted">{copy?.description}</p>
                    </div>
                    <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                      <input type="checkbox" name="enabled" defaultChecked={rule.enabled} className="size-5 accent-mekong-700" />
                      {t.enabled}
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {fields.map((field) => {
                      const value = rule.config[field];
                      return (
                        <Field key={field} id={`${rule.code}-${field}`} label={t.fields[field as keyof typeof t.fields]}>
                          <Input
                            id={`${rule.code}-${field}`}
                            name={field}
                            inputMode="numeric"
                            defaultValue={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
                          />
                        </Field>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" size="sm">{t.saveRule}</Button>
                    {!rule.enabled ? <span className="text-xs text-muted">{t.disabledNote}</span> : null}
                  </div>
                </form>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel id="failed" title={t.failedTitle}>
        {failed.length === 0 ? (
          <EmptyNote>{t.noFailed}</EmptyNote>
        ) : (
          <>
            <DataTable compact head={[t.columns.when, t.columns.rule, t.columns.subject, t.columns.error, t.columns.attempts, ""]}>
              {failed.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(e.updatedAt, locale)}</td>
                  <td className="px-4 py-2">{t.rules[e.ruleCode as keyof typeof t.rules]?.name ?? e.ruleCode}</td>
                  <td className="px-4 py-2">{e.subjectType}</td>
                  <td className="px-4 py-2 font-mono text-xs">{e.errorSummary ?? "—"}</td>
                  <td className="px-4 py-2 tabular-nums">{e.attempts}</td>
                  <td className="px-4 py-2">
                    {e.subjectType !== "rule" ? (
                      <form action={retryAutomationEventAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="next" value={here} />
                        <Button type="submit" variant="secondary" size="sm">{t.retry}</Button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </DataTable>
            <p className="mt-2 text-xs text-muted">{t.errorNote}</p>
          </>
        )}
      </Panel>

      <Panel id="runs" title={t.runsTitle}>
        {runs.length === 0 ? (
          <EmptyNote>{t.noRuns}</EmptyNote>
        ) : (
          <DataTable compact head={[t.columns.when, t.columns.trigger, t.columns.status, t.columns.result]}>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(r.startedAt, locale)}</td>
                <td className="px-4 py-2">{t.triggers[r.trigger as keyof typeof t.triggers] ?? r.trigger}</td>
                <td className="px-4 py-2">
                  <Badge tone={runTone[r.status] ?? "neutral"}>
                    {t.runStatuses[r.status as keyof typeof t.runStatuses] ?? r.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 tabular-nums">
                  {r.summary.done ?? 0} / {r.summary.failed ?? 0}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
    </div>
  );
}

export default async function AutomationPage({ searchParams }: PageProps<"/[locale]/dashboard/settings/automation">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{dict.ops.automation.title}</h1>
      <p className="mt-1 mb-6 max-w-2xl text-muted">{dict.ops.automation.intro}</p>
      <Suspense fallback={<p className="text-sm text-muted">{dict.ops.common.loading}</p>}>
        <Content searchParams={searchParams} locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}
