import { describe, expect, it } from "vitest";
import {
  getTestDatabaseUrl,
  ids,
  INSUFFICIENT_PRIVILEGE,
  withFixtures,
} from "./harness";

/**
 * Row Level Security and privilege tests (blueprint 10.6, T-011).
 * They need a local Supabase database: `npm run test:rls`
 * (setup in docs/rls-testing.md). Without one they are skipped, not passed.
 */
const enabled = getTestDatabaseUrl() !== undefined;
const suite = enabled ? describe : describe.skip;

const baseTables = [
  "profiles",
  "landlords",
  "properties",
  "property_translations",
  "property_media",
  "property_ownership",
  "leads",
  "lead_activities",
  "viewing_appointments",
  "tasks",
  "rental_deals",
  "commissions",
  "landlord_submissions",
  "finance_settings",
  "commission_transactions",
  "agent_payouts",
  "expenses",
  "deal_documents",
  "financial_audit_log",
  "automation_rules",
  "automation_runs",
  "automation_events",
  "notifications",
  "notification_preferences",
  "document_counters",
  "form_attempts",
  "generated_documents",
];

suite("RLS: structure", () => {
  it("has row level security enabled on every public table", async () => {
    await withFixtures(async (db) => {
      const rows = await db.rows<{ relname: string; relrowsecurity: boolean }>(
        `select c.relname, c.relrowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'`,
      );
      expect(rows.map((r) => r.relname).sort()).toEqual([...baseTables].sort());
      expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
    });
  });
});

suite("RLS: public visitors", () => {
  it("cannot read any base table", async () => {
    await withFixtures(async (db) => {
      await db.as("anon");
      for (const table of baseTables) {
        const error = await db.denied(`select * from public.${table}`);
        expect(error.code, table).toBe(INSUFFICIENT_PRIVILEGE);
      }
    });
  });

  it("cannot write or call privileged functions", async () => {
    await withFixtures(async (db) => {
      await db.as("anon");
      const lead = await db.denied(
        "insert into public.leads (customer_name, email) values ('Spam', 'x@y.invalid')",
      );
      expect(lead.code).toBe(INSUFFICIENT_PRIVILEGE);
      const role = await db.denied(
        "select public.set_staff_role($1, 'super_admin', true)",
        [ids.agentA],
      );
      expect(role.code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it("see only published, available, non-archived listings", async () => {
    await withFixtures(async (db) => {
      const expected = await db.rows<{ id: string }>(
        `select id from public.properties
         where publication_status = 'published' and archived_at is null
           and availability_status in ('available', 'available_from')`,
      );
      await db.as("anon");
      const visible = await db.rows<{ id: string }>("select id from public.public_properties");
      expect(visible.map((r) => r.id).sort()).toEqual(expected.map((r) => r.id).sort());
      const idsSeen = visible.map((r) => r.id);
      expect(idsSeen).toContain(ids.propPublished);
      for (const hidden of [ids.propDraftA, ids.propDraftB, ids.propRented, ids.propArchived]) {
        expect(idsSeen).not.toContain(hidden);
      }
    });
  });

  it("never receive private columns through the public views", async () => {
    await withFixtures(async (db) => {
      const rows = await db.rows<{ table_name: string; column_name: string }>(
        `select table_name, column_name from information_schema.columns
         where table_schema = 'public' and table_name like 'public\\_%'`,
      );
      const names = rows.map((r) => r.column_name);
      for (const secret of [
        "address",
        "latitude",
        "longitude",
        "assigned_agent_id",
        "created_by",
        "internal_notes",
        "phone",
        "email",
        "landlord_id",
      ]) {
        expect(names, secret).not.toContain(secret);
      }
    });
  });

  it("see translations and media only for public listings", async () => {
    await withFixtures(async (db) => {
      await db.as("anon");
      const titles = await db.rows<{ title: string }>(
        "select title from public.public_property_translations where property_id in ($1, $2)",
        [ids.propPublished, ids.propDraftB],
      );
      expect(titles.map((t) => t.title)).toEqual(["Public title"]);

      const media = await db.rows<{ property_id: string }>(
        "select property_id from public.public_property_media where property_id in ($1, $2)",
        [ids.propPublished, ids.propDraftB],
      );
      expect(media.map((m) => m.property_id)).toEqual([ids.propPublished]);
    });
  });

  it("can read files of published listings only, and never private documents", async () => {
    await withFixtures(async (db) => {
      await db.as("anon");
      const files = await db.rows<{ bucket_id: string; name: string }>(
        "select bucket_id, name from storage.objects where name like $1 or name like $2 or bucket_id = 'private-docs'",
        [`${ids.propPublished}/%`, `${ids.propDraftB}/%`],
      );
      expect(files.map((f) => f.name)).toEqual([`${ids.propPublished}/cover.jpg`]);
    });
  });
});

suite("RLS: signed-in users without staff access", () => {
  for (const who of ["outsider", "inactive"] as const) {
    it(`${who} sees no business data and cannot create any`, async () => {
      await withFixtures(async (db) => {
        await db.as(who);
        for (const table of baseTables) {
          // profiles lists the caller's own row; counters are internal (no grants at all).
          if (table === "profiles" || table === "document_counters" || table === "form_attempts") continue;
          const rows = await db.rows(`select 1 from public.${table}`);
          expect(rows, `${who} reading ${table}`).toHaveLength(0);
        }
        const error = await db.denied(
          "insert into public.leads (customer_name, email, assigned_agent_id) values ('X', 'x@y.invalid', $1)",
          [ids[who]],
        );
        expect(error.code).toBe(INSUFFICIENT_PRIVILEGE);
      });
    });
  }
});

suite("RLS: agents cannot cross into each other's data", () => {
  it("sees only their own leads", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const rows = await db.rows<{ id: string }>(
        "select id from public.leads where id in ($1, $2, $3)",
        [ids.leadA, ids.leadB, ids.leadInactive],
      );
      expect(rows.map((r) => r.id)).toEqual([ids.leadA]);
    });
  });

  it("cannot update, reassign or log activity on another agent's lead", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const updated = await db.count(
        "update public.leads set stage = 'contacted' where id = $1",
        [ids.leadB],
      );
      expect(updated).toBe(0);

      // The row is invisible to this agent, so the update touches nothing.
      const steal = await db.count(
        "update public.leads set assigned_agent_id = $1 where id = $2",
        [ids.agentA, ids.leadB],
      );
      expect(steal).toBe(0);

      const giveAway = await db.denied(
        "update public.leads set assigned_agent_id = $1 where id = $2",
        [ids.agentB, ids.leadA],
      );
      expect(giveAway.code).toBe(INSUFFICIENT_PRIVILEGE);

      const activity = await db.denied(
        "insert into public.lead_activities (lead_id, performed_by, activity_type) values ($1, $2, 'note')",
        [ids.leadB, ids.agentA],
      );
      expect(activity.code).toBe(INSUFFICIENT_PRIVILEGE);

      const read = await db.rows("select 1 from public.lead_activities where lead_id = $1", [
        ids.leadB,
      ]);
      expect(read).toHaveLength(0);
    });
  });

  it("cannot forge the author of an activity on their own lead", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const forged = await db.denied(
        "insert into public.lead_activities (lead_id, performed_by, activity_type) values ($1, $2, 'note')",
        [ids.leadA, ids.agentB],
      );
      expect(forged.code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it("sees landlord contacts only for their own properties", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const rows = await db.rows<{ id: string }>(
        "select id from public.landlords where id in ($1, $2, $3)",
        [ids.landlordA, ids.landlordB, ids.landlordFree],
      );
      expect(rows.map((r) => r.id)).toEqual([ids.landlordA]);

      const ownership = await db.rows("select 1 from public.property_ownership where property_id = $1", [
        ids.propDraftB,
      ]);
      expect(ownership).toHaveLength(0);
    });
  });

  it("sees published listings and their own drafts, not another agent's draft", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const rows = await db.rows<{ id: string }>(
        "select id from public.properties where id = any($1)",
        [[ids.propPublished, ids.propDraftA, ids.propDraftB]],
      );
      expect(rows.map((r) => r.id).sort()).toEqual([ids.propPublished, ids.propDraftA].sort());
      const translations = await db.rows(
        "select 1 from public.property_translations where property_id = $1",
        [ids.propDraftB],
      );
      expect(translations).toHaveLength(0);
    });
  });

  it("cannot publish, reassign or edit listings they do not own", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const publish = await db.denied(
        "update public.properties set publication_status = 'published' where id = $1",
        [ids.propDraftA],
      );
      expect(publish.code).toBe(INSUFFICIENT_PRIVILEGE);

      const reassign = await db.denied(
        "update public.properties set assigned_agent_id = $1 where id = $2",
        [ids.agentB, ids.propDraftA],
      );
      expect(reassign.code).toBe(INSUFFICIENT_PRIVILEGE);

      const others = await db.count(
        "update public.properties set lease_terms = 'x' where id in ($1, $2)",
        [ids.propDraftB, ids.propPublished],
      );
      expect(others).toBe(0);

      // Submitting a draft for review is allowed.
      const submit = await db.count(
        "update public.properties set publication_status = 'submitted' where id = $1",
        [ids.propDraftA],
      );
      expect(submit).toBe(1);
    });
  });

  it("cannot read other agents' deals and commissions, but reads their own", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const deals = await db.rows<{ id: string }>(
        "select id from public.rental_deals where id in ($1, $2)",
        [ids.dealA, ids.dealB],
      );
      expect(deals.map((d) => d.id)).toEqual([ids.dealA]);
      const commissions = await db.rows<{ id: string }>(
        "select id from public.commissions where id in ($1, $2)",
        [ids.commissionA, ids.commissionB],
      );
      expect(commissions.map((c) => c.id)).toEqual([ids.commissionA]);

      // Agents may read their commission but never record a payment on it.
      const record = await db.denied(
        "update public.commissions set payment_status = 'paid', amount_paid_minor = agreed_amount_minor where id = $1",
        [ids.commissionA],
      );
      expect(record.code).toBe(INSUFFICIENT_PRIVILEGE);
      await db.as("admin");
      const [row] = await db.rows<{ payment_status: string }>(
        "select payment_status from public.commissions where id = $1",
        [ids.commissionA],
      );
      expect(row?.payment_status).toBe("pending");
    });
  });

  it("cannot open a deal on another agent's lead or move a signed deal", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const foreign = await db.denied(
        `insert into public.rental_deals (lead_id, property_id, agent_id)
         values ($1, $2, $3)`,
        [ids.leadB, ids.propPublished, ids.agentA],
      );
      expect(foreign.code).toBe(INSUFFICIENT_PRIVILEGE);

      const signed = await db.count(
        "update public.rental_deals set stage = 'negotiation' where id = $1",
        [ids.dealA],
      );
      expect(signed).toBe(0);
    });
  });

  it("cannot see colleagues' profiles or edit their own role", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const rows = await db.rows<{ id: string }>("select id from public.profiles where id in ($1, $2)", [
        ids.agentA,
        ids.agentB,
      ]);
      expect(rows.map((r) => r.id)).toEqual([ids.agentA]);

      const promote = await db.denied("update public.profiles set role = 'super_admin' where id = $1", [
        ids.agentA,
      ]);
      expect(promote.code).toBe(INSUFFICIENT_PRIVILEGE);
      const reactivate = await db.denied("update public.profiles set is_active = true where id = $1", [
        ids.agentA,
      ]);
      expect(reactivate.code).toBe(INSUFFICIENT_PRIVILEGE);

      const rename = await db.count("update public.profiles set full_name = 'New Name' where id = $1", [
        ids.agentA,
      ]);
      expect(rename).toBe(1);
    });
  });

  it("can only propose, not approve, a marketing authorisation", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const approve = await db.denied(
        `insert into public.property_ownership (property_id, landlord_id, authorization_status)
         values ($1, $2, 'active')`,
        [ids.propDraftA, ids.landlordA],
      );
      expect(approve.code).toBe(INSUFFICIENT_PRIVILEGE);

      const flip = await db.count(
        "update public.property_ownership set authorization_status = 'active' where property_id = $1",
        [ids.propDraftA],
      );
      expect(flip).toBe(0);

      const verify = await db.denied(
        "update public.landlords set verification_status = 'verified' where id = $1",
        [ids.landlordA],
      );
      expect(verify.code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it("cannot read private documents or upload to another agent's property", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const docs = await db.rows("select 1 from storage.objects where bucket_id = 'private-docs'");
      expect(docs).toHaveLength(0);

      const upload = await db.denied(
        "insert into storage.objects (bucket_id, name) values ('property-media', $1)",
        [`${ids.propDraftB}/other.jpg`],
      );
      expect(upload.code).toBe(INSUFFICIENT_PRIVILEGE);
      const own = await db.count(
        "insert into storage.objects (bucket_id, name) values ('property-media', $1)",
        [`${ids.propDraftA}/mine.jpg`],
      );
      expect(own).toBe(1);
    });
  });
});

suite("RLS: public form submissions", () => {
  it("are visible to managers and admins only", async () => {
    await withFixtures(async (db) => {
      await db.query_ok(
        `insert into public.landlord_submissions (submitter_name, relationship, phone, property_category)
         values ('Visitor', 'owner', '+85500000000', 'residential')`,
      );
      // Other rows may exist (e.g. from manual testing); compare with the true count.
      const [counted] = await db.rows<{ n: number }>(
        "select count(*)::int as n from public.landlord_submissions",
      );
      const n = counted?.n ?? 0;
      expect(n).toBeGreaterThanOrEqual(1);
      for (const who of ["admin", "manager"] as const) {
        await db.as(who);
        expect(await db.rows("select 1 from public.landlord_submissions"), who).toHaveLength(n);
      }
      for (const who of ["agentA", "marketing", "finance", "outsider", "anon"] as const) {
        await db.as(who);
        if (who === "anon") {
          const error = await db.denied("select 1 from public.landlord_submissions");
          expect(error.code).toBe(INSUFFICIENT_PRIVILEGE);
        } else {
          expect(await db.rows("select 1 from public.landlord_submissions"), who).toHaveLength(0);
        }
      }
    });
  });

  it("cannot be created or edited through the public API", async () => {
    await withFixtures(async (db) => {
      await db.as("anon");
      const insert = await db.denied(
        `insert into public.landlord_submissions (submitter_name, relationship, phone, property_category)
         values ('Spam', 'owner', '+85500000000', 'residential')`,
      );
      expect(insert.code).toBe(INSUFFICIENT_PRIVILEGE);
      await db.as("agentA");
      const agent = await db.denied(
        `insert into public.landlord_submissions (submitter_name, relationship, phone, property_category)
         values ('Spam', 'owner', '+85500000000', 'residential')`,
      );
      expect(agent.code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });
});

suite("RLS: other roles", () => {
  it("manager sees every lead, may reassign and publish, but cannot record payments", async () => {
    await withFixtures(async (db) => {
      await db.as("manager");
      const leads = await db.rows("select 1 from public.leads where id in ($1, $2)", [
        ids.leadA,
        ids.leadB,
      ]);
      expect(leads).toHaveLength(2);

      expect(
        await db.count("update public.leads set assigned_agent_id = $1 where id = $2", [
          ids.agentA,
          ids.leadB,
        ]),
      ).toBe(1);
      expect(
        await db.count(
          "update public.properties set publication_status = 'published' where id = $1",
          [ids.propDraftA],
        ),
      ).toBe(1);

      const payment = await db.denied(
        "update public.commissions set amount_paid_minor = 100, payment_status = 'partial' where id = $1",
        [ids.commissionA],
      );
      expect(payment.code).toBe(INSUFFICIENT_PRIVILEGE);
      // Managers read receivables but do not change them: that is finance's job.
      expect(
        await db.count("update public.commissions set due_date = '2030-02-01' where id = $1", [
          ids.commissionA,
        ]),
      ).toBe(0);
    });
  });

  it("marketing edits listing content but sees no customers, landlords or money", async () => {
    await withFixtures(async (db) => {
      await db.as("marketing");
      for (const table of ["leads", "landlords", "rental_deals", "commissions", "lead_activities"]) {
        expect(await db.rows(`select 1 from public.${table}`), table).toHaveLength(0);
      }
      expect(
        await db.count("update public.property_translations set title = 'Better' where property_id = $1", [
          ids.propDraftB,
        ]),
      ).toBe(1);
      expect(
        await db.count("update public.properties set lease_terms = 'x' where id = $1", [ids.propDraftB]),
      ).toBe(0);
      const rows = await db.rows("select 1 from public.properties where id = $1", [ids.propDraftB]);
      expect(rows).toHaveLength(1);
    });
  });

  it("finance reads deals and commissions and records payments, but sees no leads or landlords", async () => {
    await withFixtures(async (db) => {
      await db.as("finance");
      expect(await db.rows("select 1 from public.leads")).toHaveLength(0);
      expect(await db.rows("select 1 from public.landlords")).toHaveLength(0);
      expect(
        await db.rows("select 1 from public.rental_deals where id in ($1, $2)", [ids.dealA, ids.dealB]),
      ).toHaveLength(2);
      expect(
        await db.count("update public.rental_deals set stage = 'lost' where id = $1", [ids.dealB]),
      ).toBe(0);
      expect(
        await db.count(
          `insert into public.commission_transactions
             (commission_id, entry_type, amount_minor, currency, occurred_on, payment_method)
           values ($1, 'payment', 40000, 'USD', current_date, 'cash')`,
          [ids.commissionA],
        ),
      ).toBe(1);
      const [balance] = await db.rows<{ collected_minor: string; collection_status: string }>(
        "select collected_minor, collection_status from public.commission_balances where commission_id = $1",
        [ids.commissionA],
      );
      expect(Number(balance?.collected_minor)).toBe(40000);
      expect(balance?.collection_status).toBe("paid");
    });
  });

  it("only a super admin can change roles, and not their own", async () => {
    await withFixtures(async (db) => {
      await db.as("manager");
      const byManager = await db.denied("select public.set_staff_role($1, 'manager', true)", [
        ids.agentA,
      ]);
      expect(byManager.code).toBe(INSUFFICIENT_PRIVILEGE);

      await db.as("admin");
      const self = await db.denied("select public.set_staff_role($1, 'agent', true)", [ids.admin]);
      expect(self.code).toBe(INSUFFICIENT_PRIVILEGE);

      await db.query_ok("select public.set_staff_role($1, 'manager', true)", [ids.agentA]);
      await db.as("agentA");
      // Role is read from the database on every request, so the change is immediate.
      expect(
        await db.rows("select 1 from public.leads where id = $1", [ids.leadB]),
      ).toHaveLength(1);
    });
  });

  it("a deactivated profile loses access immediately", async () => {
    await withFixtures(async (db) => {
      await db.as("admin");
      await db.query_ok("select public.set_staff_role($1, 'agent', false)", [ids.agentA]);
      await db.as("agentA");
      expect(await db.rows("select 1 from public.leads")).toHaveLength(0);
    });
  });

  it("activity history cannot be edited or deleted, even by a super admin", async () => {
    await withFixtures(async (db) => {
      await db.as("admin");
      const edit = await db.denied("update public.lead_activities set notes = 'edited' where id = $1", [
        ids.activityA,
      ]);
      expect(edit.code).toBe(INSUFFICIENT_PRIVILEGE);
      const remove = await db.denied("delete from public.lead_activities where id = $1", [ids.activityA]);
      expect(remove.code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it("properties and deals cannot be hard-deleted by any signed-in role", async () => {
    await withFixtures(async (db) => {
      for (const who of ["admin", "manager", "agentA"] as const) {
        await db.as(who);
        const property = await db.denied("delete from public.properties where id = $1", [ids.propDraftA]);
        expect(property.code, who).toBe(INSUFFICIENT_PRIVILEGE);
        const deal = await db.denied("delete from public.rental_deals where id = $1", [ids.dealA]);
        expect(deal.code, who).toBe(INSUFFICIENT_PRIVILEGE);
      }
    });
  });

  it("the data model rejects inconsistent records", async () => {
    await withFixtures(async (db) => {
      const mismatch = await db.denied(
        `insert into public.properties (listing_code, category, property_type, monthly_rent_minor, created_by)
         values ('BAD-1', 'commercial', 'villa', 1, $1)`,
        [ids.admin],
      );
      expect(mismatch.constraint).toBe("properties_type_matches_category");

      const duplicate = await db.denied(
        `insert into public.property_translations (property_id, locale, title) values ($1, 'en', 'Again')`,
        [ids.propPublished],
      );
      expect(duplicate.constraint).toBe("property_translations_one_per_locale");

      const code = await db.denied(
        `insert into public.properties (listing_code, category, property_type, monthly_rent_minor, created_by)
         values ('RLS-PUB', 'residential', 'house', 1, $1)`,
        [ids.admin],
      );
      expect(code.constraint).toBe("properties_listing_code_key");

      const lost = await db.denied("update public.leads set stage = 'lost' where id = $1", [ids.leadA]);
      expect(lost.constraint).toBe("leads_lost_needs_reason");
    });
  });
});
