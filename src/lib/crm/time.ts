/**
 * Business time is Phnom Penh time (UTC+7, no daylight saving). "Today" and
 * "this month" on the dashboard follow it, wherever the server runs.
 */
const OFFSET_MS = 7 * 60 * 60 * 1000;

export interface Bounds {
  /** Inclusive, ISO 8601 UTC. */
  start: string;
  /** Exclusive, ISO 8601 UTC. */
  end: string;
}

function localParts(now: Date) {
  const local = new Date(now.getTime() + OFFSET_MS);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth(), day: local.getUTCDate() };
}

export function phnomPenhDayBounds(now: Date): Bounds {
  const { year, month, day } = localParts(now);
  const start = Date.UTC(year, month, day) - OFFSET_MS;
  return { start: new Date(start).toISOString(), end: new Date(start + 86_400_000).toISOString() };
}

export function phnomPenhMonthBounds(now: Date): Bounds {
  const { year, month } = localParts(now);
  return {
    start: new Date(Date.UTC(year, month, 1) - OFFSET_MS).toISOString(),
    end: new Date(Date.UTC(year, month + 1, 1) - OFFSET_MS).toISOString(),
  };
}

const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-10-13T09:30" (a datetime-local value, Phnom Penh time) -> ISO UTC, or null. */
export function parsePhnomPenhDateTime(value: string): string | null {
  const m = LOCAL_DATETIME.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const utc = Date.UTC(y, mo - 1, d, h, mi);
  const date = new Date(utc);
  // Reject impossible dates such as 2026-02-31.
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return new Date(utc - OFFSET_MS).toISOString();
}

/** ISO instant -> value for <input type="datetime-local"> in Phnom Penh time. */
export function toPhnomPenhInputValue(iso: string | null): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  return new Date(time + OFFSET_MS).toISOString().slice(0, 16);
}

/** A "YYYY-MM-DD" date at the start of that Phnom Penh day, as an ISO instant. */
export function phnomPenhDateStart(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number) as [number, number, number, number];
  const utc = Date.UTC(y, mo - 1, d);
  const check = new Date(utc);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return new Date(utc - OFFSET_MS).toISOString();
}

/** Current time in ms. A function (not an inline call) so server pages stay lint-clean. */
export function currentTimeMs(): number {
  return Date.now();
}

/** Today's date in Phnom Penh as YYYY-MM-DD. */
export function phnomPenhToday(now: Date): string {
  return new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** First and last day of the Phnom Penh month containing `now`, plus helpers for common ranges. */
export function phnomPenhRanges(now: Date) {
  const today = phnomPenhToday(now);
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    today,
    thisMonth: { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) },
    lastMonth: { from: iso(new Date(Date.UTC(y, m - 2, 1))), to: iso(new Date(Date.UTC(y, m - 1, 0))) },
    year: { from: `${y}-01-01`, to: `${y}-12-31` },
  };
}
