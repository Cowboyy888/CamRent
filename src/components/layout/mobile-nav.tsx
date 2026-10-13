"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { buttonClasses } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { LanguageSwitcher } from "./language-switcher";
import type { NavItem } from "./nav-items";
import { isActivePath } from "./primary-nav";

interface MobileNavProps {
  items: NavItem[];
  locale: Locale;
  labels: {
    open: string;
    close: string;
    nav: string;
    language: string;
    listProperty: string;
  };
  listPropertyHref: string;
}

/** Menu button and panel for screens below the `lg` breakpoint. */
function MobileNavView({
  items,
  locale,
  labels,
  listPropertyHref,
  pathname,
}: MobileNavProps & { pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="grid size-11 place-items-center rounded-control text-ink hover:bg-sand-100"
      >
        <Icon name={open ? "close" : "menu"} className="size-6" />
        <span className="sr-only">{open ? labels.close : labels.open}</span>
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-sand-200 bg-white shadow-panel"
      >
        <nav aria-label={labels.nav} className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <ul className="flex flex-col">
            {items.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center rounded-control px-3 text-base font-medium hover:bg-sand-100",
                      active ? "text-mekong-700" : "text-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-col gap-4 border-t border-sand-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <LanguageSwitcher currentLocale={locale} label={labels.language} />
            <Link
              href={listPropertyHref}
              onClick={close}
              className={buttonClasses({ variant: "secondary" })}
            >
              {labels.listProperty}
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}

function ActiveMobileNav(props: MobileNavProps) {
  return <MobileNavView {...props} pathname={usePathname()} />;
}

/** Reads the path behind <Suspense>; see PrimaryNav for why. */
export function MobileNav(props: MobileNavProps) {
  return (
    <Suspense fallback={<MobileNavView {...props} pathname={null} />}>
      <ActiveMobileNav {...props} />
    </Suspense>
  );
}
