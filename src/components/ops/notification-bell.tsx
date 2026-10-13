import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPath } from "@/server/auth/constants";
import { unreadCount } from "@/server/ops/queries";

/** Bell with the caller's unread count. Reads through the caller's own session, so RLS applies. */
export async function NotificationBell({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const client = await createSupabaseServerClient();
  const count = await unreadCount(client);
  const label = interpolate(dict.ops.notifications.bell, { count: String(count) });
  return (
    <Link
      href={dashboardPath(locale, "/notifications")}
      aria-label={label}
      className="relative grid min-h-11 min-w-11 place-items-center rounded-control border border-sand-300 text-ink-soft hover:bg-sand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mekong-500 sm:min-h-9 sm:min-w-9"
    >
      <Icon name="bell" className="size-5" />
      {count > 0 ? (
        <span
          data-testid="unread-count"
          className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-laterite-600 px-1 text-[0.6875rem] font-bold text-white tabular-nums"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
