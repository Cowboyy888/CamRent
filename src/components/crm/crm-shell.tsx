import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { NotificationBell } from "@/components/ops/notification-bell";
import { CrmLanguageSwitch } from "@/components/ops/language-switch";
import { BrandMark, BrandWordmark } from "@/components/layout/brand-logo";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { canViewLeads } from "@/lib/crm/permissions";
import {
  canViewDeals,
  canViewExpenses,
  canViewFinance,
  canViewPayouts,
  canViewReceivables,
} from "@/lib/finance/permissions";
import { canManageAutomation } from "@/lib/ops/permissions";
import type { StaffRole } from "@/lib/staff-roles";
import { generatableTypes } from "@/server/documents/catalog";
import { dashboardPath } from "@/server/auth/constants";
import { signOutAction } from "@/server/auth/actions";
import { CrmNav, type CrmNavItem } from "./crm-nav";

/** CRM chrome: sidebar, user box and sign-out. Content is `children`. */
export function CrmShell({
  user,
  locale,
  dict,
  children,
}: {
  user: { fullName: string; role: StaffRole };
  locale: Locale;
  dict: Dictionary;
  children: ReactNode;
}) {
  const t = dict.crm;
  const items: CrmNavItem[] = [
    {
      href: dashboardPath(locale),
      match: dashboardPath(locale),
      exact: true,
      label: t.nav.dashboard,
      icon: "home",
    },
  ];
  if (canViewLeads(user.role)) {
    items.push({
      href: dashboardPath(locale, "/leads"),
      match: dashboardPath(locale, "/leads"),
      label: t.nav.leads,
      icon: "chat",
    });
  }
  const finance: Array<[boolean, string, string, CrmNavItem["icon"]]> = [
    [canViewDeals(user.role), "/deals", dict.fin.nav.deals, "key"],
    [canViewReceivables(user.role), "/commissions", dict.fin.nav.commissions, "check"],
    [canViewPayouts(user.role), "/payouts", dict.fin.nav.payouts, "shield"],
    [canViewExpenses(user.role), "/expenses", dict.fin.nav.expenses, "clock"],
    [canViewFinance(user.role), "/finance", dict.fin.nav.finance, "area"],
  ];
  for (const [allowed, sub, label, icon] of finance) {
    if (allowed) {
      items.push({ href: dashboardPath(locale, sub), match: dashboardPath(locale, sub), label, icon });
    }
  }
  items.push(
    { href: dashboardPath(locale, "/tasks"), match: dashboardPath(locale, "/tasks"), label: dict.ops.nav.tasks, icon: "tasks" },
    {
      href: dashboardPath(locale, "/notifications"),
      match: dashboardPath(locale, "/notifications"),
      label: dict.ops.nav.notifications,
      icon: "bell",
    },
  );
  if (generatableTypes(user.role).length > 0) {
    items.push({
      href: dashboardPath(locale, "/documents"),
      match: dashboardPath(locale, "/documents"),
      label: dict.ops.nav.documents,
      icon: "file",
    });
  }
  if (canManageAutomation(user.role)) {
    items.push({
      href: dashboardPath(locale, "/settings/automation"),
      match: dashboardPath(locale, "/settings"),
      label: dict.ops.nav.automation,
      icon: "cog",
    });
  }
  const planned = [t.nav.viewings, t.nav.properties, t.nav.landlords];

  return (
    <div className="flex min-h-dvh flex-col bg-sand-100 lg:flex-row">
      <aside className="bg-ink text-sand-200 lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:shrink-0 lg:overflow-y-auto">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <BrandMark className="bg-mekong-500" />
          <BrandWordmark inverse />
          <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-sand-200">
            CRM
          </span>
        </div>
        <CrmNav items={items} planned={planned} plannedBadge={t.nav.soon} label={t.nav.label} />
        <p className="hidden px-5 pb-5 text-xs lg:block">
          <Link href={localizedPath(locale)} className="text-sand-300 hover:text-white hover:underline">
            {t.nav.publicSite}
          </Link>
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-sand-200 bg-white px-5 py-2">
          <p className="text-sm font-semibold text-ink-soft">{t.nav.workspace}</p>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <CrmLanguageSwitch current={locale} label={dict.ops.nav.language} />
            <Suspense fallback={null}>
              <NotificationBell locale={locale} dict={dict} />
            </Suspense>
            <p className="text-right text-sm leading-tight">
              <span className="block font-semibold text-ink">{user.fullName}</span>
              <span className="block text-xs text-muted">{t.roles[user.role]}</span>
            </p>
            <form action={signOutAction}>
              <button
                type="submit"
                className="min-h-11 rounded-control border border-sand-300 px-3 text-sm font-semibold text-ink-soft transition-colors hover:bg-sand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mekong-500 sm:min-h-9"
              >
                {t.nav.signOut}
              </button>
            </form>
          </div>
        </header>
        <main id="main-content" className="flex-1 p-5 sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
