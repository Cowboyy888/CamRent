import { notFound } from "next/navigation";

/**
 * Any unknown path under a locale (e.g. /km/xyz) renders the localised
 * not-found page inside the site layout instead of the generic 404.
 */
export default function CatchAllNotFound() {
  notFound();
}
