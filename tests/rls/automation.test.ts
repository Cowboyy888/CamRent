import { describe, expect, it } from "vitest";
import { getTestDatabaseUrl, ids, INSUFFICIENT_PRIVILEGE, Session, withFixtures } from "./harness";

/**
 * Step 6: automation engine, notifications and generated documents
 * (migrations 0012-0013). Time is controlled by ageing fixture rows.
 */
const enabled = getTestDatabaseUrl() !== undefined;
const suite = enabled ? describe : describe.skip;

const CHECK_VIOLATION = "23514";
const RULES = [
  "new_inquiry_task",
  "unassigned_inquiry_notify",
  "no_contact_sla",
  "viewing_confirmation_task",
  "viewing_completed_prompt",
  "negotiation_followup",
  "overdue_task_reminder",
  "upcoming_viewing_reminder",
  "lease_expiry_renewal",
];

/** Run automation as the system (the scheduled path). */
async function run(db: Session, rule?: string, subject?: string): Promise<string> {
  const [row] = await db.rows<{ id: string }>(
    "select private.run_automation('schedule', null, $1, $2) as id",
    [rule ?? null, subject ?? null],
  );
  return row!.id;
}

async function only(db: Session, rule: string) {
  // Keep a test about one rule from being affected by the others.
  await db.query_ok("update public.automation_rules set enabled = (code = $1)", [rule]);
}

async function lead(
  db: Session,
  o: { agent?: string | null; stage?: string; ageHours?: number; name?: string } = {},
): Promise<string> {
  const [row] = await db.rows<{ id: string }>(
    `insert into public.leads (customer_name, email, assigned_agent_id, stage, created_at)
     values ($1, 'auto@customer.invalid', $2, $3, now() - make_interval(hours => $4)) returning id`,
    [o.name ?? "Auto Customer", o.agent === undefined ? ids.agentA : o.agent, o.stage ?? "new", o.ageHours ?? 0],
  );
  return row!.id;
}

const tasksFor = (db: Session, leadId: string, source?: string) =>
  db.rows<{ id: string; assigned_to: string; source: string; automation_key: string; title: string }>(
    `select id, assigned_to, source, automation_key, title from public.tasks
     where lead_id = $1 and ($2::text is null or source = $2)`,
    [leadId, source ?? null],
  );

/** Notifications for a user, optionally narrowed to a type and to the records a test created. */
const notificationsFor = (db: Session, user: string, type?: string, about?: string[]) =>
  db.rows<{ id: string; type: string; entity_id: string; read_at: string | null }>(
    `select id, type, entity_id, read_at from public.notifications
     where recipient_id = $1 and ($2::text is null or type::text = $2)
       and ($3::uuid[] is null or entity_id = any($3))`,
    [user, type ?? null, about ?? null],
  );

suite("Automation: rules create work once", () => {
  it("creates a task for the assigned agent and never twice", async () => {
    await withFixtures(async (db) => {
      await only(db, "new_inquiry_task");
      const id = await lead(db);
      await run(db);
      await run(db);
      await run(db);
      const tasks = await tasksFor(db, id, "new_inquiry_task");
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({ assigned_to: ids.agentA, source: "new_inquiry_task" });

      const [events] = await db.rows<{ n: number }>(
        "select count(*)::int n from public.automation_events where subject_id = $1", [id]);
      expect(events!.n).toBe(1);
      // The agent is told about the task, once.
      expect(await notificationsFor(db, ids.agentA, "task_assigned", [tasks[0]!.id])).toHaveLength(1);
    });
  });

  it("skips unassigned leads and old leads for the agent task", async () => {
    await withFixtures(async (db) => {
      await only(db, "new_inquiry_task");
      const unassigned = await lead(db, { agent: null });
      const old = await lead(db, { ageHours: 24 * 30 });
      await run(db);
      expect(await tasksFor(db, unassigned)).toHaveLength(0);
      expect(await tasksFor(db, old)).toHaveLength(0);
    });
  });

  it("notifies managers about an unassigned inquiry, once, respecting preferences", async () => {
    await withFixtures(async (db) => {
      await only(db, "unassigned_inquiry_notify");
      const id = await lead(db, { agent: null, ageHours: 2 });
      await db.query_ok(
        "insert into public.notification_preferences (user_id, type, enabled) values ($1, 'lead_unassigned', false)",
        [ids.manager],
      );
      await run(db);
      await run(db);
      expect(await notificationsFor(db, ids.admin, "lead_unassigned", [id])).toHaveLength(1);
      expect(await notificationsFor(db, ids.manager, "lead_unassigned", [id])).toHaveLength(0); // opted out
      expect(await notificationsFor(db, ids.agentA, "lead_unassigned", [id])).toHaveLength(0);
    });
  });

  it("flags a lead with no recorded contact after the SLA, and not one that was contacted", async () => {
    await withFixtures(async (db) => {
      await only(db, "no_contact_sla");
      const silent = await lead(db, { ageHours: 30, name: "Silent" });
      const contacted = await lead(db, { ageHours: 30, name: "Contacted" });
      const fresh = await lead(db, { ageHours: 1, name: "Fresh" });
      await db.query_ok(
        `insert into public.lead_activities (lead_id, performed_by, activity_type, notes)
         values ($1, $2, 'call', 'x')`, [contacted, ids.agentA]);
      await run(db);
      await run(db);
      const flags = await db.rows<{ id: string; sla_breached_at: string | null }>(
        "select id, sla_breached_at from public.leads where id = any($1)", [[silent, contacted, fresh]]);
      const by = Object.fromEntries(flags.map((f) => [f.id, f.sla_breached_at]));
      expect(by[silent]).not.toBeNull();
      expect(by[contacted]).toBeNull();
      expect(by[fresh]).toBeNull();
      expect(await notificationsFor(db, ids.agentA, "lead_sla_breached", [silent])).toHaveLength(1);
      expect(await notificationsFor(db, ids.manager, "lead_sla_breached", [silent])).toHaveLength(1);
      expect(await notificationsFor(db, ids.agentA, "lead_sla_breached", [contacted, fresh])).toHaveLength(0);
    });
  });

  it("asks for a confirmation task per viewing time, and again after a reschedule", async () => {
    await withFixtures(async (db) => {
      await only(db, "viewing_confirmation_task");
      const leadId = await lead(db, { stage: "viewing_scheduled" });
      const [v] = await db.rows<{ id: string }>(
        `insert into public.viewing_appointments (lead_id, property_id, agent_id, scheduled_at)
         values ($1, $2, $3, now() + interval '3 days') returning id`,
        [leadId, ids.propPublished, ids.agentA]);
      await run(db);
      await run(db);
      expect(await tasksFor(db, leadId, "viewing_confirmation_task")).toHaveLength(1);

      await db.query_ok(
        "update public.viewing_appointments set scheduled_at = now() + interval '4 days' where id = $1", [v!.id]);
      await run(db);
      await run(db);
      expect(await tasksFor(db, leadId, "viewing_confirmation_task")).toHaveLength(2);
    });
  });

  it("prompts for the result of a viewing that has passed", async () => {
    await withFixtures(async (db) => {
      await only(db, "viewing_completed_prompt");
      const leadId = await lead(db, { stage: "viewing_scheduled" });
      const [past] = await db.rows<{ id: string }>(
        `insert into public.viewing_appointments (lead_id, property_id, agent_id, scheduled_at)
         values ($1, $2, $3, now() - interval '3 hours') returning id`,
        [leadId, ids.propPublished, ids.agentA]);
      const [done] = await db.rows<{ id: string }>(
        `insert into public.viewing_appointments (lead_id, property_id, agent_id, scheduled_at, status)
         values ($1, $2, $3, now() - interval '5 hours', 'completed') returning id`,
        [leadId, ids.propDraftA, ids.agentA]);
      await run(db);
      await run(db);
      const tasks = await tasksFor(db, leadId, "viewing_completed_prompt");
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.automation_key).toContain(past!.id);
      expect(tasks[0]!.automation_key).not.toContain(done!.id);
    });
  });

  it("follows up a quiet negotiation once per interval, not while a task is open", async () => {
    await withFixtures(async (db) => {
      await only(db, "negotiation_followup");
      const id = await lead(db, { stage: "negotiation", ageHours: 24 * 10 });
      await db.query_ok("set local session_replication_role = replica");
      await db.query_ok("update public.leads set updated_at = now() - interval '9 days' where id = $1", [id]);
      await db.query_ok("set local session_replication_role = origin");
      await run(db);
      await run(db);
      expect(await tasksFor(db, id, "negotiation_followup")).toHaveLength(1);

      // A recent activity keeps a different lead quiet.
      const active = await lead(db, { stage: "negotiation", ageHours: 24 * 10 });
      await db.query_ok(
        `insert into public.lead_activities (lead_id, performed_by, activity_type) values ($1, $2, 'note')`,
        [active, ids.agentA]);
      await run(db);
      expect(await tasksFor(db, active, "negotiation_followup")).toHaveLength(0);
    });
  });

  it("reminds about overdue tasks, only open ones, once per window", async () => {
    await withFixtures(async (db) => {
      await only(db, "overdue_task_reminder");
      const [open] = await db.rows<{ id: string }>(
        `insert into public.tasks (title, assigned_to, created_by, due_at, status)
         values ('Late', $1, $2, now() - interval '2 days', 'todo') returning id`, [ids.agentA, ids.manager]);
      await db.query_ok(
        `insert into public.tasks (title, assigned_to, created_by, due_at, status)
         values ('Finished', $1, $2, now() - interval '2 days', 'done')`, [ids.agentA, ids.manager]);
      await run(db);
      await run(db);
      const n = await notificationsFor(db, ids.agentA, "task_overdue");
      const mine = n.filter((x) => x.entity_id === open!.id);
      expect(mine).toHaveLength(1);
      const [finished] = await db.rows<{ id: string }>("select id from public.tasks where title = 'Finished'");
      expect(n.filter((x) => x.entity_id === finished!.id)).toHaveLength(0);
    });
  });

  it("creates one renewal task per tightest period and notifies the agent", async () => {
    await withFixtures(async (db) => {
      await only(db, "lease_expiry_renewal");
      const near = await newClosedDeal(db, 20);
      const mid = await newClosedDeal(db, 60);
      const far = await newClosedDeal(db, 200);
      await run(db);
      await run(db);
      const keys = await db.rows<{ deal_id: string; automation_key: string }>(
        "select deal_id, automation_key from public.tasks where source = 'lease_expiry_renewal'");
      const byDeal = Object.fromEntries(keys.map((k) => [k.deal_id, k.automation_key]));
      expect(byDeal[near]).toMatch(/:30$/);
      expect(byDeal[mid]).toMatch(/:90$/);
      expect(byDeal[far]).toBeUndefined();
      expect(keys.filter((k) => [near, mid, far].includes(k.deal_id))).toHaveLength(2);
      expect(await notificationsFor(db, ids.agentA, "lease_expiring", [near, mid, far])).toHaveLength(2);
    });
  });

  it("does nothing for a disabled rule and keeps history", async () => {
    await withFixtures(async (db) => {
      await only(db, "new_inquiry_task");
      const first = await lead(db, { name: "Before" });
      await run(db);
      await db.query_ok("update public.automation_rules set enabled = false where code = 'new_inquiry_task'");
      const second = await lead(db, { name: "After" });
      await run(db);
      expect(await tasksFor(db, first)).toHaveLength(1);
      expect(await tasksFor(db, second)).toHaveLength(0);
      const [events] = await db.rows<{ n: number }>(
        "select count(*)::int n from public.automation_events where subject_id = any($1)", [[first, second]]);
      expect(events!.n).toBe(1);
    });
  });

  it("records failures with a safe summary and retries without duplicating", async () => {
    await withFixtures(async (db) => {
      await only(db, "new_inquiry_task");
      const id = await lead(db, { name: "Private Name Ltd" });
      await db.query_ok(`
        create function pg_temp.boom() returns trigger language plpgsql as
        $$ begin raise exception 'secret detail about Private Name Ltd'; end $$;
        create trigger tmp_boom before insert on public.tasks for each row execute function pg_temp.boom();`);

      const failedRun = await run(db);
      const [ev] = await db.rows<{ id: string; status: string; error_summary: string; attempts: number }>(
        "select id, status, error_summary, attempts from public.automation_events where subject_id = $1", [id]);
      expect(ev).toMatchObject({ status: "failed", attempts: 1 });
      // Only the SQL state is kept, never the message or any customer data.
      expect(ev!.error_summary).toMatch(/^P0001/);
      expect(ev!.error_summary).not.toContain("Private");
      const [r] = await db.rows<{ status: string }>("select status from public.automation_runs where id = $1", [failedRun]);
      expect(r!.status).toBe("failed");
      expect(await tasksFor(db, id)).toHaveLength(0);

      // Fix the cause, then retry as a manager.
      await db.query_ok("drop trigger tmp_boom on public.tasks");
      await db.as("agentA");
      expect((await db.denied("select public.retry_automation_event($1)", [ev!.id])).code)
        .toBe(INSUFFICIENT_PRIVILEGE);
      await db.as("manager");
      await db.query_ok("select public.retry_automation_event($1)", [ev!.id]);
      // Retrying work that is already done is refused, so it cannot duplicate.
      expect((await db.denied("select public.retry_automation_event($1)", [ev!.id])).code)
        .toBe(CHECK_VIOLATION);

      await db.as("admin");
      expect(await tasksFor(db, id)).toHaveLength(1);
      const [after] = await db.rows<{ status: string; attempts: number; error_summary: string | null }>(
        "select status, attempts, error_summary from public.automation_events where id = $1", [ev!.id]);
      expect(after).toMatchObject({ status: "done", attempts: 2, error_summary: null });
    });
  });

  it("is configurable only within sensible limits, by managers only", async () => {
    await withFixtures(async (db) => {
      await db.as("manager");
      expect(await db.count(
        `update public.automation_rules set config = '{"due_hours": 4, "lookback_days": 10}' where code = 'new_inquiry_task'`)).toBe(1);
      for (const bad of [
        `{"due_hours": 0}`, `{"due_hours": "soon"}`, `{"nonsense": 1}`, `{"due_hours": 1.5}`,
      ]) {
        const e = await db.denied(
          "update public.automation_rules set config = $1::jsonb where code = 'new_inquiry_task'", [bad]);
        expect(e.code, bad).toBe(CHECK_VIOLATION);
      }
      expect((await db.denied(
        `update public.automation_rules set config = '{"reminder_days": []}' where code = 'lease_expiry_renewal'`)).code)
        .toBe(CHECK_VIOLATION);

      await db.as("agentA");
      expect(await db.rows("select 1 from public.automation_rules")).toHaveLength(0);
      expect(await db.count("update public.automation_rules set enabled = false")).toBe(0);
      expect(await db.rows("select 1 from public.automation_events")).toHaveLength(0);
      await db.as("anon");
      expect((await db.denied("select 1 from public.automation_rules")).code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it("runs on demand for managers, and the scheduled entry point is not callable by users", async () => {
    await withFixtures(async (db) => {
      await db.as("manager");
      const [r] = await db.rows<{ id: string }>("select public.run_automation_now() as id");
      expect(r!.id).toBeTruthy();
      for (const who of ["agentA", "finance", "marketing", "anon"] as const) {
        await db.as(who);
        expect((await db.denied("select public.run_automation_now()")).code, who).toBe(INSUFFICIENT_PRIVILEGE);
      }
      await db.as("admin");
      expect((await db.denied("select public.run_automation_scheduled()")).code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it("has an entry for every rule the application knows", async () => {
    await withFixtures(async (db) => {
      const rows = await db.rows<{ code: string }>("select code from public.automation_rules order by code");
      expect(rows.map((r) => r.code)).toEqual([...RULES].sort());
    });
  });
});

async function newClosedDeal(db: Session, daysLeft: number): Promise<string> {
  const leadId = await lead(db, { stage: "won", name: `Lease ${daysLeft}` });
  const [property] = await db.rows<{ id: string }>(
    `insert into public.properties (listing_code, category, property_type, monthly_rent_minor, created_by)
     values ('LEASE-' || substr(gen_random_uuid()::text, 1, 8), 'residential', 'apartment', 1, $1) returning id`,
    [ids.admin]);
  const [deal] = await db.rows<{ id: string }>(
    `insert into public.rental_deals
       (lead_id, property_id, agent_id, landlord_id, agreed_monthly_rent_minor, lease_start, lease_end,
        stage, closing_date, agreement_reference, commission_method, commission_fixed_minor)
     values ($1, $2, $3, $4, 1000, (now() at time zone 'Asia/Phnom_Penh')::date - 300,
             (now() at time zone 'Asia/Phnom_Penh')::date + $5::int,
             'closed_won', current_date - 300, 'LEASE', 'fixed_amount', 100) returning id`,
    [leadId, property!.id, ids.agentA, ids.landlordA, daysLeft]);
  return deal!.id;
}

suite("Notifications", () => {
  it("tells an agent about an assignment by someone else, and a previous agent about a reassignment", async () => {
    await withFixtures(async (db) => {
      const id = await lead(db, { agent: null });
      await db.as("manager");
      await db.query_ok("update public.leads set assigned_agent_id = $1 where id = $2", [ids.agentA, id]);
      await db.query_ok("update public.leads set assigned_agent_id = $1 where id = $2", [ids.agentB, id]);
      await db.client.query("reset role");
      expect(await notificationsFor(db, ids.agentA, "lead_assigned", [id])).toHaveLength(1);
      expect(await notificationsFor(db, ids.agentA, "lead_reassigned", [id])).toHaveLength(1);
      expect(await notificationsFor(db, ids.agentB, "lead_assigned", [id])).toHaveLength(1);
      // Nobody is notified of what they did themselves.
      expect(await notificationsFor(db, ids.manager, undefined, [id])).toHaveLength(0);
    });
  });

  it("notifies the right people about a new task, a reschedule and a payout decision", async () => {
    await withFixtures(async (db) => {
      await db.as("manager");
      const [t] = await db.rows<{ id: string }>(
        `insert into public.tasks (title, assigned_to, created_by) values ('Call back', $1, $2) returning id`,
        [ids.agentA, ids.manager]);
      await db.client.query("reset role");
      expect(await notificationsFor(db, ids.agentA, "task_assigned", [t!.id])).toHaveLength(1);

      await db.as("finance");
      await db.query_ok(
        `insert into public.commission_transactions (commission_id, entry_type, amount_minor, currency, occurred_on, payment_method)
         values ($1, 'payment', 40000, 'USD', current_date, 'cash')`, [ids.commissionA]);
      const [p] = await db.rows<{ id: string }>(
        `insert into public.agent_payouts (deal_id, amount_minor, currency, agent_id, requested_by)
         values ($1, 1000, 'USD', $2, $3) returning id`, [ids.dealA, ids.agentA, ids.finance]);
      await db.as("manager");
      await db.query_ok("update public.agent_payouts set status = 'approved' where id = $1", [p!.id]);

      await db.client.query("reset role");
      // Managers are asked to approve; the agent hears the outcome; finance, who asked, does not.
      const about = async (user: string) =>
        (await db.rows<{ n: number }>(
          "select count(*)::int n from public.notifications where recipient_id = $1 and dedupe_key like $2",
          [user, `payout:${p!.id}:%`],
        ))[0]!.n;
      expect(await about(ids.manager)).toBe(1); // asked to approve (the request, not the approval)
      expect(await about(ids.admin)).toBe(1);
      expect(await about(ids.agentA)).toBe(1);
      expect(await about(ids.finance)).toBe(0);
      // The commission became fully paid: the deal's agent is told.
      expect(await notificationsFor(db, ids.agentA, "commission_updated", [ids.commissionA])).toHaveLength(1);
    });
  });

  it("is private to its recipient, minimal, and can only be marked read", async () => {
    await withFixtures(async (db) => {
      const id = await lead(db, { agent: null });
      await db.as("manager");
      await db.query_ok("update public.leads set assigned_agent_id = $1 where id = $2", [ids.agentA, id]);

      await db.as("agentB");
      expect(await notificationsFor(db, ids.agentA, undefined, [id])).toHaveLength(0);
      expect(await db.count("update public.notifications set read_at = now() where entity_id = $1", [id])).toBe(0);

      await db.as("agentA");
      const mine = await notificationsFor(db, ids.agentA, undefined, [id]);
      expect(mine).toHaveLength(1);
      expect(mine[0]!.read_at).toBeNull();
      expect(await db.count("update public.notifications set read_at = now() where id = $1", [mine[0]!.id])).toBe(1);
      expect((await notificationsFor(db, ids.agentA, undefined, [id]))[0]!.read_at).not.toBeNull();

      // No way to rewrite what a notification points at, or to create or delete one.
      expect((await db.denied("update public.notifications set entity_id = gen_random_uuid()")).code)
        .toBe(INSUFFICIENT_PRIVILEGE);
      expect((await db.denied(
        `insert into public.notifications (recipient_id, type, entity_type, entity_id, dedupe_key)
         values ($1, 'task_overdue', 'task', gen_random_uuid(), 'x')`, [ids.agentA])).code)
        .toBe(INSUFFICIENT_PRIVILEGE);
      expect((await db.denied("delete from public.notifications")).code).toBe(INSUFFICIENT_PRIVILEGE);

      // Only ids and a type are stored: no names, no amounts.
      const cols = await db.rows<{ column_name: string }>(
        "select column_name from information_schema.columns where table_name = 'notifications'");
      expect(cols.map((c) => c.column_name).sort()).toEqual(
        ["created_at", "dedupe_key", "entity_id", "entity_type", "id", "read_at", "recipient_id", "type"]);
    });
  });
});

suite("Generated documents", () => {
  const create = (type: string, entity: string, locale = "en") =>
    [
      `insert into public.generated_documents (doc_type, entity_id, locale, generated_by, reference)
       values ($1, $2, $3, $4, 'IGNORED') returning id, reference`,
      [type, entity, locale, ids.agentA],
    ] as const;

  it("numbers documents per type and year, ignoring any number sent by the client", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const a = await db.rows<{ reference: string }>(...create("inquiry_summary", ids.leadA));
      const b = await db.rows<{ reference: string }>(...create("inquiry_summary", ids.leadA, "km"));
      const year = new Date(Date.now() + 7 * 3_600_000).getUTCFullYear();
      const n = (r: string) => Number(r.split("-")[2]);
      expect(a[0]!.reference).toMatch(new RegExp(`^IN-${year}-\\d{6}$`));
      expect(n(b[0]!.reference)).toBe(n(a[0]!.reference) + 1);
      await db.as("finance");
      const c = await db.rows<{ reference: string }>(
        `insert into public.generated_documents (doc_type, entity_id, locale, generated_by, reference)
         values ('deal_summary', $1, 'en', $2, 'X') returning reference`, [ids.dealA, ids.finance]);
      expect(c[0]!.reference).toMatch(new RegExp(`^DS-${year}-\\d{6}$`));
    });
  });

  it("checks the record permission for each document type", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      // Own lead: yes. Another agent's lead: no. Commission statement: no.
      await db.query_ok(...create("inquiry_summary", ids.leadA));
      expect((await db.denied(...create("inquiry_summary", ids.leadB))).code).toBe(INSUFFICIENT_PRIVILEGE);
      expect((await db.denied(...create("commission_statement", ids.commissionA))).code).toBe(INSUFFICIENT_PRIVILEGE);
      expect((await db.denied(...create("landlord_submission", ids.leadA))).code).toBe(INSUFFICIENT_PRIVILEGE);
      expect((await db.denied(...create("agreement_draft", ids.dealA))).code).toBe(INSUFFICIENT_PRIVILEGE);

      await db.as("marketing");
      const asMarketing = (type: string, entity: string) =>
        db.denied(
          `insert into public.generated_documents (doc_type, entity_id, locale, generated_by, reference)
           values ($1, $2, 'en', $3, 'X')`, [type, entity, ids.marketing]);
      expect((await asMarketing("inquiry_summary", ids.leadA)).code).toBe(INSUFFICIENT_PRIVILEGE);
      expect((await asMarketing("deal_summary", ids.dealA)).code).toBe(INSUFFICIENT_PRIVILEGE);
      await db.query_ok(
        `insert into public.generated_documents (doc_type, entity_id, locale, generated_by, reference)
         values ('listing_sheet', $1, 'zh', $2, 'X')`, [ids.propPublished, ids.marketing]);

      await db.as("finance");
      for (const [type, entity] of [["commission_statement", ids.commissionA], ["payout_statement", ids.dealA], ["deal_summary", ids.dealA]] as const) {
        await db.query_ok(
          `insert into public.generated_documents (doc_type, entity_id, locale, generated_by, reference)
           values ($1, $2, 'en', $3, 'X')`, [type, entity, ids.finance]);
      }
      expect((await db.denied(
        `insert into public.generated_documents (doc_type, entity_id, locale, generated_by, reference)
         values ('inquiry_summary', $1, 'en', $2, 'X')`, [ids.leadA, ids.finance])).code)
        .toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it("cannot be forged for someone else, read by others, edited or deleted", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const [doc] = await db.rows<{ id: string }>(...create("inquiry_summary", ids.leadA));
      // A manager can read it (they can read the lead); another agent cannot.
      await db.as("manager");
      expect(await db.rows("select 1 from public.generated_documents where id = $1", [doc!.id])).toHaveLength(1);
      await db.as("agentB");
      expect(await db.rows("select 1 from public.generated_documents where id = $1", [doc!.id])).toHaveLength(0);

      // Authorship cannot be claimed for someone else: it is always the signed-in user.
      await db.as("agentB");
      const [forged] = await db.rows<{ generated_by: string }>(
        `insert into public.generated_documents (doc_type, entity_id, locale, generated_by, reference)
         values ('inquiry_summary', $1, 'en', $2, 'X') returning generated_by`, [ids.leadB, ids.agentA]);
      expect(forged!.generated_by).toBe(ids.agentB);

      await db.as("agentA");
      expect((await db.denied("delete from public.generated_documents where id = $1", [doc!.id])).code)
        .toBe(INSUFFICIENT_PRIVILEGE);
      expect((await db.denied("update public.generated_documents set reference = 'HACK' where id = $1", [doc!.id])).code)
        .toBe(INSUFFICIENT_PRIVILEGE);
      // The file can be attached once, and only once.
      expect(await db.count(
        "update public.generated_documents set storage_path = $2, file_name = 'a.pdf' where id = $1",
        [doc!.id, `generated/${doc!.id}/a.pdf`])).toBe(1);
      expect(await db.count(
        "update public.generated_documents set storage_path = 'generated/x/b.pdf' where id = $1", [doc!.id])).toBe(0);
    });
  });

  it("stores files privately: only the author uploads, only people with access read", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const [doc] = await db.rows<{ id: string }>(...create("inquiry_summary", ids.leadA));
      const path = `generated/${doc!.id}/doc.pdf`;
      await db.as("agentB");
      expect((await db.denied(
        "insert into storage.objects (bucket_id, name) values ('private-docs', $1)", [path])).code)
        .toBe(INSUFFICIENT_PRIVILEGE);
      await db.as("agentA");
      expect(await db.count(
        "insert into storage.objects (bucket_id, name) values ('private-docs', $1)", [path])).toBe(1);
      expect(await db.rows("select 1 from storage.objects where name = $1", [path])).toHaveLength(1);
      await db.as("agentB");
      expect(await db.rows("select 1 from storage.objects where name = $1", [path])).toHaveLength(0);
      await db.as("anon");
      expect(await db.rows("select 1 from storage.objects where name = $1", [path])).toHaveLength(0);
    });
  });
});

suite("Tasks owned by the system", () => {
  it("lets the assignee complete them and records when", async () => {
    await withFixtures(async (db) => {
      await only(db, "new_inquiry_task");
      const id = await lead(db);
      await run(db);
      const [t] = await tasksFor(db, id);
      await db.as("agentA");
      expect(await db.count("update public.tasks set status = 'done' where id = $1", [t!.id])).toBe(1);
      const [row] = await db.rows<{ completed_at: string | null }>(
        "select completed_at from public.tasks where id = $1", [t!.id]);
      expect(row!.completed_at).not.toBeNull();
      await db.as("agentB");
      expect(await db.rows("select 1 from public.tasks where id = $1", [t!.id])).toHaveLength(0);
      expect(await db.count("update public.tasks set status = 'cancelled' where id = $1", [t!.id])).toBe(0);
    });
  });
});
