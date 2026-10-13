import type { Database } from "@/types/database";

export type NotificationType = Database["public"]["Enums"]["notification_type"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];

/** Every notification type, in the order shown on the preferences form. */
export const notificationTypes = [
  "lead_assigned",
  "lead_reassigned",
  "lead_unassigned",
  "lead_sla_breached",
  "viewing_scheduled",
  "viewing_upcoming",
  "viewing_rescheduled",
  "task_assigned",
  "task_overdue",
  "payout_updated",
  "commission_updated",
  "lease_expiring",
] as const satisfies readonly NotificationType[];

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && (notificationTypes as readonly string[]).includes(value);
}

export const taskStatuses = ["todo", "in_progress", "done", "cancelled"] as const satisfies readonly TaskStatus[];

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (taskStatuses as readonly string[]).includes(value);
}

/** Settings each automation rule exposes (mirrors the defaults in the database). */
export const ruleSettings: Record<string, readonly string[]> = {
  new_inquiry_task: ["due_hours", "lookback_days"],
  unassigned_inquiry_notify: ["after_minutes", "lookback_days"],
  no_contact_sla: ["sla_hours", "lookback_days"],
  viewing_confirmation_task: ["hours_before", "lookback_days"],
  viewing_completed_prompt: ["grace_minutes", "lookback_days"],
  negotiation_followup: ["interval_days", "due_hours"],
  overdue_task_reminder: ["repeat_hours", "lookback_days"],
  upcoming_viewing_reminder: ["hours_before"],
  lease_expiry_renewal: ["reminder_days"],
};

export type EntityType = "lead" | "task" | "deal" | "commission";

/** CRM path of the record a notification points at (relative to the dashboard). */
export function entityPath(type: EntityType, id: string): string {
  switch (type) {
    case "lead":
      return `/leads/${id}`;
    case "task":
      return "/tasks";
    case "deal":
      return `/deals/${id}`;
    case "commission":
      return `/commissions/${id}`;
  }
}
