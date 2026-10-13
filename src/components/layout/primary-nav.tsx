"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/cn";
import type { NavItem } from "./nav-items";

export function isActivePath(pathname: string | null, href: string): boolean {
  if (pathname === null) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop navigation with the current section marked for screen readers. */
function PrimaryNavView({
  items,
  label,
  pathname,
}: {
  items: NavItem[];
  label: string;
  pathname: string | null;
}) {
  return (
    <nav aria-label={label} className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-control px-3 py-2 text-[0.9375rem] font-medium transition-colors hover:bg-sand-100 hover:text-ink",
                  active ? "text-mekong-700" : "text-ink-soft",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ActivePrimaryNav(props: { items: NavItem[]; label: string }) {
  return <PrimaryNavView {...props} pathname={usePathname()} />;
}

/**
 * The current path is only known per request on dynamic routes such as
 * /properties/[id], so reading it sits behind <Suspense>; the fallback is the
 * same navigation without the "current page" marker.
 */
export function PrimaryNav(props: { items: NavItem[]; label: string }) {
  return (
    <Suspense fallback={<PrimaryNavView {...props} pathname={null} />}>
      <ActivePrimaryNav {...props} />
    </Suspense>
  );
}
