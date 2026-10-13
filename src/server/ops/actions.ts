"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import { isTaskStatus, notificationTypes, ruleSettings } from "@/lib/ops/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminAccess, requireRole } from "@/server/auth/admin-access";
import { dashboardPath, localeOrDefault } from "@/server/auth/constants";
import { safeNextPath } from "@/server/auth/redirect";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
};

/** Where an action sends the person back to: always a dashboard path. */
function back(formData: FormData, locale: string, fallback: string, notice?: string): never {
  const base = safeNextPath(text(formData, "next"), dashboardPath(localeOrDefault(locale), fallback));
  const [path, query = ""] = base.split("?");
  const kept = query.split("&").filter((p) => p && !p.startsWith("notice="));
  if (notice) kept.push(`notice=${notice}`);
  redirect(kept.length ? `${path}?${kept.join("&")}` : path!);
}

// Notifications ---------------------------------------------------------------------
export async function markNotificationReadAction(formData: FormData): Promise<void> {
  await requireAdminAccess();
  const id = text(formData, "id");
  if (GUID.test(id)) {
    const client = await createSupabaseServerClient();
    await client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  }
  revalidatePath("/[locale]/dashboard", "layout");
  back(formData, text(formData, "locale"), "/notifications");
}

export async function markAllNotificationsReadAction(formData: FormData): Promise<void> {
  await requireAdminAccess();
  const client = await createSupabaseServerClient();
  await client.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/[locale]/dashboard", "layout");
  back(formData, text(formData, "locale"), "/notifications");
}

export async function saveNotificationPreferencesAction(formData: FormData): Promise<void> {
  const access = await requireAdminAccess();
  const client = await createSupabaseServerClient();
  // The table grants INSERT and UPDATE(enabled) only, so an upsert (which
  // rewrites key columns) is not allowed: create missing rows, then set the flag.
  const rows = notificationTypes.map((type) => ({ user_id: access.userId, type }));
  const created = await client
    .from("notification_preferences")
    .upsert(rows, { onConflict: "user_id,type", ignoreDuplicates: true });
  const wanted = notificationTypes.filter((type) => formData.has(`type:${type}`));
  const unwanted = notificationTypes.filter((type) => !formData.has(`type:${type}`));
  const [on, off] = await Promise.all([
    client.from("notification_preferences").update({ enabled: true }).eq("user_id", access.userId).in("type", wanted),
    client.from("notification_preferences").update({ enabled: false }).eq("user_id", access.userId).in("type", unwanted),
  ]);
  const error = created.error ?? on.error ?? off.error;
  revalidatePath("/[locale]/dashboard/notifications", "page");
  back(formData, text(formData, "locale"), "/notifications", error ? "error" : "saved");
}

// Tasks -------------------------------------------------------------------------------
export async function updateTaskStatusAction(formData: FormData): Promise<void> {
  await requireAdminAccess();
  const id = text(formData, "id");
  const status = text(formData, "status");
  let notice: string | undefined;
  if (GUID.test(id) && isTaskStatus(status)) {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.from("tasks").update({ status }).eq("id", id).select("id");
    if (error || !data?.length) notice = "error";
  } else {
    notice = "error";
  }
  revalidatePath("/[locale]/dashboard", "layout");
  back(formData, text(formData, "locale"), "/tasks", notice);
}

// Automation settings ----------------------------------------------------------------
export async function saveAutomationRuleAction(formData: FormData): Promise<void> {
  const access = await requireRole("super_admin", "manager");
  const locale = text(formData, "locale");
  const code = text(formData, "code");
  const fields = ruleSettings[code];
  if (!fields) back(formData, locale, "/settings/automation", "error");

  const config: Record<string, number | number[]> = {};
  for (const field of fields) {
    const raw = text(formData, field);
    if (field === "reminder_days") {
      const days = raw.split(/[,\s]+/).filter(Boolean).map(Number);
      if (days.length === 0 || days.some((n) => !Number.isInteger(n))) {
        back(formData, locale, "/settings/automation", "invalid");
      }
      config[field] = [...new Set(days)].sort((a, b) => b - a);
    } else {
      const n = Number(raw);
      if (raw === "" || !Number.isInteger(n)) back(formData, locale, "/settings/automation", "invalid");
      config[field] = n;
    }
  }

  const client = await createSupabaseServerClient();
  const { error } = await client
    .from("automation_rules")
    .update({ enabled: formData.has("enabled"), config, updated_by: access.userId })
    .eq("code", code);
  revalidatePath("/[locale]/dashboard/settings/automation", "page");
  // 23514 = the database refused a value outside its allowed range.
  back(formData, locale, "/settings/automation", error ? (error.code === "23514" ? "invalid" : "error") : "saved");
}

export async function runAutomationNowAction(formData: FormData): Promise<void> {
  await requireRole("super_admin", "manager");
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("run_automation_now");
  revalidatePath("/[locale]/dashboard", "layout");
  back(formData, text(formData, "locale"), "/settings/automation", error ? "error" : "ran");
}

export async function retryAutomationEventAction(formData: FormData): Promise<void> {
  await requireRole("super_admin", "manager");
  const id = text(formData, "id");
  let notice = "error";
  if (GUID.test(id)) {
    const client = await createSupabaseServerClient();
    const { error } = await client.rpc("retry_automation_event", { event: id });
    if (!error) notice = "retried";
  }
  revalidatePath("/[locale]/dashboard/settings/automation", "page");
  back(formData, text(formData, "locale"), "/settings/automation", notice);
}

// Language ------------------------------------------------------------------------------
/** Saves the language as the person's preference and moves to the same page in it. */
export async function setLanguageAction(formData: FormData): Promise<void> {
  const access = await requireAdminAccess();
  const to = text(formData, "to");
  if (!isLocale(to)) redirect(dashboardPath());
  const client = await createSupabaseServerClient();
  await client.from("profiles").update({ preferred_language: to }).eq("id", access.userId);
  (await cookies()).set(LOCALE_COOKIE, to, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  redirect(safeNextPath(text(formData, "next"), dashboardPath(to)));
}
