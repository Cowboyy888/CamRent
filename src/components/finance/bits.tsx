import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { formatMoney } from "@/lib/format";
import type { Database } from "@/types/database";

type Currency = Database["public"]["Enums"]["currency_code"];

export function Amount({ minor, currency }: { minor: number | null | undefined; currency: Currency | null | undefined }) {
  if (minor === null || minor === undefined || !currency) return <span className="text-muted">—</span>;
  return <span className="tabular-nums">{formatMoney({ amountMinor: minor, currency })}</span>;
}

const stageTones: Record<string, BadgeTone> = {
  negotiation: "warning",
  reserved: "warning",
  agreement_pending: "info",
  closed_won: "success",
  closed_lost: "danger",
  cancelled: "neutral",
  lease_expired: "neutral",
};

export function DealStageBadge({ stage, dict }: { stage: string; dict: Dictionary }) {
  const key = stage as keyof Dictionary["fin"]["dealStages"];
  const mapped = ({ lease_signed: "closed_won", commission_invoiced: "closed_won", commission_collected: "closed_won", lost: "closed_lost" } as Record<string, string>)[stage] ?? stage;
  return <Badge tone={stageTones[mapped] ?? "neutral"}>{dict.fin.dealStages[key]}</Badge>;
}

const collectionTones: Record<string, BadgeTone> = {
  not_due: "neutral",
  due: "warning",
  partially_paid: "info",
  paid: "success",
  overdue: "danger",
  written_off: "neutral",
};

export function CollectionBadge({ status, dict }: { status: string | null; dict: Dictionary }) {
  if (!status) return null;
  const key = status as keyof Dictionary["fin"]["collection"];
  return <Badge tone={collectionTones[status] ?? "neutral"}>{dict.fin.collection[key]}</Badge>;
}

const payoutTones: Record<string, BadgeTone> = {
  pending_approval: "warning",
  approved: "info",
  paid: "success",
  rejected: "danger",
  cancelled: "neutral",
  reversed: "danger",
};

export function PayoutBadge({ status, dict }: { status: string; dict: Dictionary }) {
  const key = status as keyof Dictionary["fin"]["payoutStatuses"];
  return <Badge tone={payoutTones[status] ?? "neutral"}>{dict.fin.payoutStatuses[key]}</Badge>;
}

const expenseTones: Record<string, BadgeTone> = { pending: "warning", approved: "success", rejected: "danger" };

export function ExpenseBadge({ status, dict }: { status: string; dict: Dictionary }) {
  const key = status as keyof Dictionary["fin"]["expenseStatuses"];
  return <Badge tone={expenseTones[status] ?? "neutral"}>{dict.fin.expenseStatuses[key]}</Badge>;
}

export function Pager({
  page,
  pageCount,
  hrefFor,
  dict,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  dict: Dictionary;
}) {
  if (pageCount <= 1) return null;
  const c = dict.fin.common;
  const off = buttonClasses({ variant: "secondary", className: "pointer-events-none opacity-50" });
  return (
    <nav aria-label={c.pagination} className="mt-6 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className={buttonClasses({ variant: "secondary" })}>
          {c.previous}
        </Link>
      ) : (
        <span aria-disabled="true" className={off}>{c.previous}</span>
      )}
      <p className="text-sm font-medium tabular-nums text-ink-soft">{interpolate(c.pageOf, { page, total: pageCount })}</p>
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} rel="next" className={buttonClasses({ variant: "secondary" })}>
          {c.next}
        </Link>
      ) : (
        <span aria-disabled="true" className={off}>{c.next}</span>
      )}
    </nav>
  );
}

/** Small table wrapper with consistent styling and horizontal scroll on phones. */
export function DataTable({
  head,
  children,
  compact = false,
}: {
  head: string[];
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-sand-200 bg-white">
      <table className={`w-full border-collapse text-left text-sm ${compact ? "" : "min-w-[44rem]"}`}>
        <thead className="bg-sand-50 text-xs tracking-wide text-muted uppercase">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-200">{children}</tbody>
      </table>
    </div>
  );
}

/** One-line summary of what an audit row changed, from its stored new values. */
export function auditDetail(
  row: { entity_type: string; new_data: unknown },
  dict: Dictionary,
): string {
  const d = (row.new_data ?? {}) as Record<string, unknown>;
  const pick = <T extends string>(value: unknown, map: Record<T, string>): string | null =>
    typeof value === "string" && value in map ? map[value as T] : null;
  switch (row.entity_type) {
    case "rental_deals":
      return pick(d.stage, dict.fin.dealStages) ?? "";
    case "agent_payouts":
      return pick(d.status, dict.fin.payoutStatuses) ?? "";
    case "expenses":
      return pick(d.status, dict.fin.expenseStatuses) ?? "";
    case "commission_transactions":
      return pick(d.entry_type, dict.fin.entryTypes) ?? "";
    default:
      return "";
  }
}
