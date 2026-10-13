import { describe, expect, it } from "vitest";
import { getTestDatabaseUrl, ids, INSUFFICIENT_PRIVILEGE, withFixtures } from "./harness";

/**
 * Step 7 audit: structural checks over the whole schema, so a table, view or
 * function added later cannot silently be exposed.
 */
const suite = getTestDatabaseUrl() !== undefined ? describe : describe.skip;

const PUBLIC_VIEWS = ["public_properties", "public_property_media", "public_property_translations"];
/** Owner-run on purpose: staff_names exposes only id, name and role, and only to active staff. */
const OWNER_RUN_VIEWS = [...PUBLIC_VIEWS, "staff_names"];

suite("security audit: schema", () => {
  it("anonymous visitors hold privileges only on the three public views", async () => {
    await withFixtures(async (db) => {
      const rows = await db.rows<{ table_name: string; privilege_type: string }>(
        `select table_name, privilege_type from information_schema.role_table_grants
         where grantee = 'anon' and table_schema = 'public'`,
      );
      const unexpected = rows.filter((r) => !PUBLIC_VIEWS.includes(r.table_name) || r.privilege_type !== "SELECT");
      expect(unexpected).toEqual([]);
    });
  });

  it("every table in public has row level security enabled", async () => {
    await withFixtures(async (db) => {
      const rows = await db.rows<{ relname: string }>(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
      );
      expect(rows.map((r) => r.relname)).toEqual([]);
    });
  });

  it("no function in public is executable by anonymous visitors", async () => {
    await withFixtures(async (db) => {
      const rows = await db.rows<{ proname: string }>(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`,
      );
      expect(rows.map((r) => r.proname)).toEqual([]);
    });
  });

  it("every SECURITY DEFINER function pins its search_path", async () => {
    await withFixtures(async (db) => {
      const rows = await db.rows<{ proname: string }>(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'private') and p.prosecdef
           and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
      );
      expect(rows.map((r) => r.proname)).toEqual([]);
    });
  });

  it("all storage buckets are private", async () => {
    await withFixtures(async (db) => {
      const rows = await db.rows<{ id: string }>("select id from storage.buckets where public");
      expect(rows).toEqual([]);
    });
  });

  it("views over private tables run with the caller's rights", async () => {
    await withFixtures(async (db) => {
      const rows = await db.rows<{ relname: string; reloptions: string[] | null }>(
        `select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'v'`,
      );
      for (const view of rows) {
        const invoker = (view.reloptions ?? []).includes("security_invoker=true");
        if (OWNER_RUN_VIEWS.includes(view.relname)) continue; // intentionally owner-run, fixed column list
        expect(invoker, `${view.relname} must be security_invoker`).toBe(true);
      }
    });
  });
});

suite("security audit: privileges and tamper resistance", () => {
  it("staff cannot change their own role or active flag", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const e = await db.denied("update public.profiles set role = 'super_admin' where id = $1", [ids.agentA]);
      expect(e.code).toBe(INSUFFICIENT_PRIVILEGE);
      const e2 = await db.denied("update public.profiles set is_active = true where id = $1", [ids.agentA]);
      expect(e2.code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it("nobody can edit or delete the commission ledger, not even finance or an administrator", async () => {
    await withFixtures(async (db) => {
      for (const who of ["finance", "admin"] as const) {
        await db.as(who);
        await db.denied("update public.commission_transactions set amount_minor = 1");
        await db.denied("delete from public.commission_transactions");
      }
    });
  });

  it("the financial audit log cannot be written or erased through the API", async () => {
    await withFixtures(async (db) => {
      for (const who of ["agentA", "finance", "admin"] as const) {
        await db.as(who);
        await db.denied("delete from public.financial_audit_log");
        await db.denied("update public.financial_audit_log set action = 'x'");
        await db.denied(
          "insert into public.financial_audit_log (action, entity_type, entity_id) values ('x', 'y', gen_random_uuid())",
        );
      }
    });
  });

  it("the form throttle table and document counters are not reachable by any API role", async () => {
    await withFixtures(async (db) => {
      for (const who of ["anon", "agentA", "admin"] as const) {
        await db.as(who);
        await db.denied("select * from public.form_attempts");
        await db.denied("insert into public.form_attempts (client_hash, kind) values (repeat('a', 64), 'enquiry')");
        await db.denied("select * from public.document_counters");
      }
    });
  });

  it("the scheduled automation entry point is service-role only", async () => {
    await withFixtures(async (db) => {
      for (const who of ["anon", "admin", "agentA"] as const) {
        await db.as(who);
        const e = await db.denied("select public.run_automation_scheduled()");
        expect(e.code).toBe(INSUFFICIENT_PRIVILEGE);
      }
    });
  });

  it("staff cannot call privileged helpers in the private schema", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const e = await db.denied("select private.run_automation('schedule')");
      expect(e.code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });
});
