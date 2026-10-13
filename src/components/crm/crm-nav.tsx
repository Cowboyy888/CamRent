"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export interface CrmNavItem {
  href: string;
  label: string;
  icon: IconName;
  /** The item is active for this path and anything below it. */
  match: string;
  /** Exact match only (the dashboard root). */
  exact?: boolean;
}

function NavView({
  items,
  planned,
  plannedBadge,
  label,
  pathname,
}: {
  items: CrmNavItem[];
  planned: string[];
  plannedBadge: string;
  label: string;
  pathname: string | null;
}) {
  return (
    <nav aria-label={label} className="px-3 pb-4">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col">
        {items.map((item) => {
          const active =
            pathname !== null &&
            (item.exact ? pathname === item.match : pathname === item.match || pathname.startsWith(`${item.match}/`));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-control px-3 py-2 text-sm font-semibold whitespace-nowrap",
                  active ? "bg-white/10 text-white" : "text-sand-200 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            </li>
          );
        })}
        {planned.map((name) => (
          <li
            key={name}
            className="flex items-center justify-between gap-3 rounded-control px-3 py-2 text-sm whitespace-nowrap text-sand-300/80"
          >
            <span>{name}</span>
            <span className="text-[0.6875rem] text-sand-300/60">{plannedBadge}</span>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ActiveNav(props: Omit<Parameters<typeof NavView>[0], "pathname">) {
  return <NavView {...props} pathname={usePathname()} />;
}

/** The current path is read behind <Suspense>; the fallback has no active marker. */
export function CrmNav(props: Omit<Parameters<typeof NavView>[0], "pathname">) {
  return (
    <Suspense fallback={<NavView {...props} pathname={null} />}>
      <ActiveNav {...props} />
    </Suspense>
  );
}
