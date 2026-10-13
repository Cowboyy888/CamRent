import { isLocale, type Locale } from "./config";

/** Builds a locale-prefixed path: localizedPath("km", "/landlords") -> "/km/landlords". */
export function localizedPath(locale: Locale, path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}

/** Removes a leading locale segment: "/zh/rent/commercial" -> "/rent/commercial". */
export function stripLocale(pathname: string): string {
  const segments = pathname.split("/");
  if (isLocale(segments[1])) {
    const rest = segments.slice(2).join("/");
    return rest ? `/${rest}` : "/";
  }
  return pathname || "/";
}

/**
 * Same page in another language, keeping the query string, so switching
 * language never loses the visitor's place or filters.
 */
export function switchLocalePath(
  pathname: string,
  target: Locale,
  search = "",
): string {
  const query = search && !search.startsWith("?") ? `?${search}` : search;
  return `${localizedPath(target, stripLocale(pathname))}${query === "?" ? "" : query}`;
}
