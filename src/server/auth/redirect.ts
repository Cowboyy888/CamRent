/**
 * Accepts a post-sign-in destination only if it is a path inside the CRM
 * ("/{locale}/dashboard", optionally with sub-paths and a query string).
 * Anything else (other sites, protocol-relative URLs, backslash tricks,
 * control characters) falls back, so the `next` parameter cannot be used as
 * an open redirect.
 */
const DASHBOARD_PATH = /^\/(?:en|km|zh)\/dashboard(?:\/(?!\.+(?:\/|\?|$))[A-Za-z0-9._~%-]+)*(?:\?[A-Za-z0-9._~%&=+,:@!$'()*;-]*)?$/;

export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  return DASHBOARD_PATH.test(raw) ? raw : fallback;
}
