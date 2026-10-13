import { describe, expect, it } from "vitest";
import { getTestDatabaseUrl, ids, INSUFFICIENT_PRIVILEGE, withFixtures } from "./harness";

/** CRM history, directory views and dashboard functions (migration 0008). */
const enabled = getTestDatabaseUrl() !== undefined;
const suite = enabled ? describe : describe.skip;

const window = [
  "2000-01-01T00:00:00Z",
  "2100-01-01T00:00:00Z",
  "2000-01-01T00:00:00Z",
  "2100-01-01T00:00:00Z",
];

suite("CRM: history is written by the database", () => {
  it("records stage changes with the signed-in staff member", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      await db.query_ok("update public.leads set stage = 'contacted' where id = $1", [ids.leadA]);
      await db.query_ok(
        "update public.leads set stage = 'on_hold', lost_reason = 'Travelling' where id = $1",
        [ids.leadA],
      );
      const rows = await db.rows<{
        performed_by: string;
        from_stage: string;
        to_stage: string;
        notes: string | null;
      }>(
        `select performed_by, from_stage, to_stage, notes from public.lead_activities
         where lead_id = $1 and activity_type = 'stage_change'`,
        [ids.leadA],
      );
      // Both changes share one transaction timestamp here, so compare as a set.
      // The fixture's signed deal already made this lead "won".
      expect(rows.map((r) => `${r.from_stage}>${r.to_stage}`).sort()).toEqual([
        "contacted>on_hold",
        "won>contacted",
      ]);
      expect(rows.every((r) => r.performed_by === ids.agentA)).toBe(true);
      expect(rows.find((r) => r.to_stage === "on_hold")?.notes).toBe("Travelling");
    });
  });

  it("records assignment changes made by a manager", async () => {
    await withFixtures(async (db) => {
      await db.as("manager");
      await db.query_ok("update public.leads set assigned_agent_id = $1 where id = $2", [
        ids.agentB,
        ids.leadA,
      ]);
      const rows = await db.rows<{ performed_by: string; from_agent_id: string; to_agent_id: string }>(
        `select performed_by, from_agent_id, to_agent_id from public.lead_activities
         where lead_id = $1 and activity_type = 'assignment'`,
        [ids.leadA],
      );
      expect(rows).toEqual([
        { performed_by: ids.manager, from_agent_id: ids.agentA, to_agent_id: ids.agentB },
      ]);
    });
  });

  it("does not let an agent change history or reassign their lead", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const reassign = await db.denied(
        "update public.leads set assigned_agent_id = $1 where id = $2",
        [ids.agentB, ids.leadA],
      );
      expect(reassign.code).toBe(INSUFFICIENT_PRIVILEGE);
      const rewrite = await db.denied(
        "update public.lead_activities set to_stage = 'won' where lead_id = $1",
        [ids.leadA],
      );
      expect(rewrite.code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it("accepts the new pipeline statuses", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      for (const stage of ["viewing_scheduled", "negotiation", "reserved", "won", "unresponsive"]) {
        const n = await db.count("update public.leads set stage = $1 where id = $2", [stage, ids.leadA]);
        expect(n, stage).toBe(1);
      }
    });
  });
});

suite("CRM: directory and list views", () => {
  it("staff see colleague names but never phone numbers; the public sees nothing", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const rows = await db.rows<{ id: string; full_name: string }>(
        "select id, full_name from public.staff_names where id in ($1, $2)",
        [ids.manager, ids.agentB],
      );
      expect(rows).toHaveLength(2);
      const columns = await db.rows<{ column_name: string }>(
        "select column_name from information_schema.columns where table_name = 'staff_names'",
      );
      expect(columns.map((c) => c.column_name).sort()).toEqual(["full_name", "id", "role"]);

      await db.as("anon");
      expect((await db.denied("select * from public.staff_names")).code).toBe(INSUFFICIENT_PRIVILEGE);
      await db.as("outsider");
      expect(await db.rows("select * from public.staff_names")).toHaveLength(0);
    });
  });

  it("the lead list follows each caller's row level security", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const mine = await db.rows<{ id: string }>(
        "select id from public.crm_lead_list where id in ($1, $2)",
        [ids.leadA, ids.leadB],
      );
      expect(mine.map((r) => r.id)).toEqual([ids.leadA]);

      await db.as("manager");
      expect(
        await db.rows("select 1 from public.crm_lead_list where id in ($1, $2)", [ids.leadA, ids.leadB]),
      ).toHaveLength(2);

      for (const who of ["marketing", "finance", "outsider"] as const) {
        await db.as(who);
        expect(
          await db.rows("select 1 from public.crm_lead_list where id in ($1, $2)", [ids.leadA, ids.leadB]),
          who,
        ).toHaveLength(0);
      }
      await db.as("anon");
      expect((await db.denied("select * from public.crm_lead_list")).code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });
});

suite("CRM: dashboard aggregates", () => {
  const summary = async (db: Awaited<Parameters<Parameters<typeof withFixtures>[0]>[0]>) => {
    const [row] = await db.rows<{ s: Record<string, unknown> }>(
      "select public.crm_dashboard_summary($1, $2, $3, $4) as s",
      window,
    );
    return row?.s as {
      active_leads: number;
      deals_negotiation: number;
      commission_earned: Array<{ currency: string; amount_minor: number }>;
      commission_outstanding: Array<{ currency: string; amount_minor: number }>;
    };
  };

  it("counts only what the caller may see", async () => {
    await withFixtures(async (db) => {
      const [{ n: all }] = (await db.rows<{ n: number }>(
        "select count(*)::int as n from public.leads where stage not in ('won','lost','cancelled','unresponsive','on_hold')",
      )) as [{ n: number }];

      await db.as("manager");
      expect((await summary(db)).active_leads).toBe(all);

      await db.as("agentA");
      const [mine] = await db.rows<{ n: number }>(
        `select count(*)::int as n from public.leads
         where assigned_agent_id = $1 and stage not in ('won','lost','cancelled','unresponsive','on_hold')`,
        [ids.agentA],
      );
      expect((await summary(db)).active_leads).toBe(mine?.n);

      await db.as("outsider");
      expect((await summary(db)).active_leads).toBe(0);
    });
  });

  it("agent performance lists every agent for a manager but only self for an agent", async () => {
    await withFixtures(async (db) => {
      await db.as("manager");
      const all = await db.rows<{ agent_id: string }>(
        "select agent_id from public.crm_agent_performance($1, $2) where agent_id in ($3, $4)",
        [window[2], window[3], ids.agentA, ids.agentB],
      );
      expect(all).toHaveLength(2);
      await db.as("agentA");
      const own = await db.rows<{ agent_id: string }>(
        "select agent_id from public.crm_agent_performance($1, $2)",
        [window[2], window[3]],
      );
      expect(own.map((r) => r.agent_id)).toEqual([ids.agentA]);
    });
  });
});
