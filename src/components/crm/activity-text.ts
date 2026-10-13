import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/lib/format";
import type { ActivityItem } from "@/server/crm/queries";

/** One-line description of an activity, in the staff member's language. */
export function describeActivity(item: ActivityItem, dict: Dictionary, locale: Locale): string {
  const h = dict.crm.lead.history;
  const stages = dict.crm.stages;
  const unknown = dict.crm.common.staffMember;

  switch (item.type) {
    case "stage_change":
      return interpolate(h.stage_change, {
        from: item.fromStage ? stages[item.fromStage] : dict.crm.common.notSet,
        to: item.toStage ? stages[item.toStage] : dict.crm.common.notSet,
      });
    case "assignment":
      if (!item.toAgent && item.fromAgent) return interpolate(h.assignment_clear, { from: item.fromAgent });
      if (item.fromAgent) {
        return interpolate(h.assignment_change, { from: item.fromAgent, to: item.toAgent ?? unknown });
      }
      return interpolate(h.assignment_to, { to: item.toAgent ?? unknown });
    case "viewing": {
      let date = item.notes ?? "";
      try {
        if (item.notes) date = formatDateTime(item.notes, locale);
      } catch {
        // Keep the raw text if it is not a timestamp.
      }
      return interpolate(h.viewing, { date });
    }
    default:
      return h[item.type];
  }
}
