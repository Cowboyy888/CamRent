import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { isActiveStage } from "@/lib/crm/stages";
import { formatDateTime } from "@/lib/format";
import { dashboardPath } from "@/server/auth/constants";
import type { LeadListItem } from "@/server/crm/queries";
import { StageBadge } from "./stage-badge";

export function LeadTable({
  rows,
  locale,
  dict,
  now,
}: {
  rows: LeadListItem[];
  locale: Locale;
  dict: Dictionary;
  now: number;
}) {
  const c = dict.crm.leads.columns;
  return (
    <div className="overflow-x-auto rounded-card border border-sand-200 bg-white">
      <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
        <thead className="bg-sand-50 text-xs tracking-wide text-muted uppercase">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">{c.customer}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{c.contact}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{c.property}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{c.agent}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{c.status}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{c.followUp}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{c.received}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-200">
          {rows.map((row) => {
            const overdue =
              row.nextFollowUpAt !== null &&
              isActiveStage(row.stage) &&
              Date.parse(row.nextFollowUpAt) < now;
            return (
              <tr key={row.id} className="align-top hover:bg-sand-50">
                <th scope="row" className="px-4 py-3 font-semibold">
                  <Link
                    href={dashboardPath(locale, `/leads/${row.id}`)}
                    className="text-mekong-700 hover:underline"
                  >
                    {row.customerName}
                  </Link>
                </th>
                <td className="px-4 py-3 text-ink-soft">
                  {row.phone ? <p>{row.phone}</p> : null}
                  {row.email ? <p className="break-all">{row.email}</p> : null}
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {row.propertyReference ?? row.preferredArea ?? dict.crm.leads.noProperty}
                  {row.propertyDistrict ? (
                    <span className="block text-xs text-muted">{row.propertyDistrict}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {row.agentName ?? dict.crm.common.unassigned}
                </td>
                <td className="px-4 py-3">
                  <StageBadge stage={row.stage} dict={dict} />
                  {row.slaBreachedAt && isActiveStage(row.stage) ? (
                    <Badge tone="danger" className="mt-1 block w-fit" title={dict.ops.tasks.slaBreachedHint}>
                      {dict.ops.tasks.slaBreached}
                    </Badge>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {row.nextFollowUpAt ? (
                    <>
                      {formatDateTime(row.nextFollowUpAt, locale)}
                      {overdue ? (
                        <Badge tone="danger" className="ml-2">
                          {dict.crm.leads.overdue}
                        </Badge>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-muted">{dict.crm.common.notSet}</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink-soft">
                  {formatDateTime(row.createdAt, locale)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
