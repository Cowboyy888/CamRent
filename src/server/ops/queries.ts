import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntityType } from "@/lib/ops/constants";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;
export type Result<T> = { ok: true; data: T } | { ok: false };

export async function unreadCount(client: Client): Promise<number> {
  const { count, error } = await client
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return error ? 0 : (count ?? 0);
}

export interface NotificationItem {
  id: string;
  type: Database["public"]["Enums"]["notification_type"];
  entityType: EntityType;
  entityId: string;
  createdAt: string;
  readAt: string | null;
  /** Customer name or task title, only when the viewer may read that record. */
  label: string | null;
}

/** The caller's own notifications (RLS limits rows to the recipient). */
export async function listNotifications(client: Client, limit = 50): Promise<Result<NotificationItem[]>> {
  const { data, error } = await client
    .from("notifications")
    .select("id, type, entity_type, entity_id, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { ok: false };

  const ids = (type: string) => [...new Set((data ?? []).filter((n) => n.entity_type === type).map((n) => n.entity_id))];
  const leadIds = ids("lead");
  const taskIds = ids("task");
  const [leads, tasks] = await Promise.all([
    leadIds.length ? client.from("leads").select("id, customer_name").in("id", leadIds) : null,
    taskIds.length ? client.from("tasks").select("id, title, source").in("id", taskIds) : null,
  ]);
  const names = new Map<string, string>();
  for (const l of leads?.data ?? []) names.set(l.id, l.customer_name);
  for (const t of tasks?.data ?? []) if (!t.source) names.set(t.id, t.title);

  return {
    ok: true,
    data: (data ?? []).map((n) => ({
      id: n.id,
      type: n.type,
      entityType: n.entity_type as EntityType,
      entityId: n.entity_id,
      createdAt: n.created_at,
      readAt: n.read_at,
      label: names.get(n.entity_id) ?? null,
    })),
  };
}

export async function loadDisabledTypes(client: Client): Promise<Set<string>> {
  const { data } = await client.from("notification_preferences").select("type, enabled").eq("enabled", false);
  return new Set((data ?? []).map((p) => p.type));
}

export interface TaskItem {
  id: string;
  title: string;
  source: string | null;
  status: Database["public"]["Enums"]["task_status"];
  priority: Database["public"]["Enums"]["task_priority"];
  dueAt: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  leadId: string | null;
  leadName: string | null;
  dealId: string | null;
}

export async function listTasks(
  client: Client,
  options: { userId: string; scope: "mine" | "all"; status: "open" | "all" | Database["public"]["Enums"]["task_status"] },
): Promise<Result<TaskItem[]>> {
  let query = client
    .from("tasks")
    .select("id, title, source, status, priority, due_at, assigned_to, lead_id, deal_id")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(200);
  if (options.scope === "mine") query = query.eq("assigned_to", options.userId);
  if (options.status === "open") query = query.in("status", ["todo", "in_progress"]);
  else if (options.status !== "all") query = query.eq("status", options.status);
  const { data, error } = await query;
  if (error) return { ok: false };

  const rows = data ?? [];
  const leadIds = [...new Set(rows.flatMap((t) => (t.lead_id ? [t.lead_id] : [])))];
  const staffIds = [...new Set(rows.flatMap((t) => (t.assigned_to ? [t.assigned_to] : [])))];
  const [leads, staff] = await Promise.all([
    leadIds.length ? client.from("leads").select("id, customer_name").in("id", leadIds) : null,
    staffIds.length ? client.from("staff_names").select("id, full_name").in("id", staffIds) : null,
  ]);
  const leadName = new Map((leads?.data ?? []).map((l) => [l.id, l.customer_name]));
  const staffName = new Map((staff?.data ?? []).flatMap((s) => (s.id && s.full_name ? [[s.id, s.full_name] as const] : [])));

  return {
    ok: true,
    data: rows.map((t) => ({
      id: t.id,
      title: t.title,
      source: t.source,
      status: t.status,
      priority: t.priority,
      dueAt: t.due_at,
      assignedTo: t.assigned_to,
      assigneeName: t.assigned_to ? (staffName.get(t.assigned_to) ?? null) : null,
      leadId: t.lead_id,
      leadName: t.lead_id ? (leadName.get(t.lead_id) ?? null) : null,
      dealId: t.deal_id,
    })),
  };
}

export async function countOverdueTasks(client: Client, userId: string, now: Date): Promise<number> {
  const { count, error } = await client
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", userId)
    .in("status", ["todo", "in_progress"])
    .lt("due_at", now.toISOString());
  return error ? 0 : (count ?? 0);
}

export interface AutomationOverview {
  rules: Array<{ code: string; enabled: boolean; config: Record<string, unknown>; updatedAt: string }>;
  runs: Array<{
    id: string;
    trigger: string;
    status: string;
    startedAt: string;
    summary: { done?: number; failed?: number };
  }>;
  failed: Array<{
    id: string;
    ruleCode: string;
    subjectType: string;
    errorSummary: string | null;
    attempts: number;
    updatedAt: string;
  }>;
  lastScheduledAt: string | null;
}

export async function loadAutomation(client: Client): Promise<Result<AutomationOverview>> {
  const [rules, runs, failed, scheduled] = await Promise.all([
    client.from("automation_rules").select("code, enabled, config, updated_at").order("code"),
    client
      .from("automation_runs")
      .select("id, trigger, status, started_at, summary")
      .order("started_at", { ascending: false })
      .limit(15),
    client
      .from("automation_events")
      .select("id, rule_code, subject_type, error_summary, attempts, updated_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(25),
    client
      .from("automation_runs")
      .select("started_at")
      .eq("trigger", "schedule")
      .neq("status", "skipped")
      .order("started_at", { ascending: false })
      .limit(1),
  ]);
  if (rules.error || runs.error || failed.error) return { ok: false };
  return {
    ok: true,
    data: {
      rules: (rules.data ?? []).map((r) => ({
        code: r.code,
        enabled: r.enabled,
        config: (r.config ?? {}) as Record<string, unknown>,
        updatedAt: r.updated_at,
      })),
      runs: (runs.data ?? []).map((r) => ({
        id: r.id,
        trigger: r.trigger,
        status: r.status,
        startedAt: r.started_at,
        summary: (r.summary ?? {}) as { done?: number; failed?: number },
      })),
      failed: (failed.data ?? []).map((e) => ({
        id: e.id,
        ruleCode: e.rule_code,
        subjectType: e.subject_type,
        errorSummary: e.error_summary,
        attempts: e.attempts,
        updatedAt: e.updated_at,
      })),
      lastScheduledAt: scheduled.data?.[0]?.started_at ?? null,
    },
  };
}
