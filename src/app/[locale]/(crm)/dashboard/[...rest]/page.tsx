import { notFound } from "next/navigation";

/** Unknown /dashboard/* paths render the dashboard 404 inside the CRM layout. */
export default function DashboardCatchAll() {
  notFound();
}
