import { describe, expect, it } from "vitest";
import { getTestDatabaseUrl, ids, INSUFFICIENT_PRIVILEGE, Session, withFixtures } from "./harness";

/**
 * Step 5: deal terms, commission calculation, receivable ledger, agent
 * payouts, expenses, audit trail and reports (migrations 0009-0011).
 * Every figure asserted here is computed independently of the code under test.
 */
const enabled = getTestDatabaseUrl() !== undefined;
const suite = enabled ? describe : describe.skip;

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const EXCLUSION_VIOLATION = "23P01";

const num = (value: unknown) => Number(value);

type Row = Record<string, unknown>;
interface Report {
  by_currency: Row[];
  revenue_by_agent: Row[];
  revenue_by_property_type: Row[];
}

interface NewDeal {
  rent?: number;
  start?: string;
  end?: string;
  method?: string | null;
  rate?: number | null;
  fixed?: number | null;
  shareMethod?: "none" | "percent_of_commission" | "fixed_amount";
  shareRate?: number | null;
  shareFixed?: number | null;
  stage?: string;
  currency?: "USD" | "KHR";
  agent?: string;
  landlord?: string | null;
  closing?: string | null;
  agreement?: string | null;
  reason?: string | null;
}

/** Creates a lead, a property and a deal as the superuser; returns the deal id. */
async function newDeal(db: Session, o: NewDeal = {}): Promise<string> {
  const agent = o.agent ?? ids.agentA;
  const [lead] = await db.rows<{ id: string }>(
    `insert into public.leads (customer_name, email, assigned_agent_id)
     values ('Fin Customer', 'fin@customer.invalid', $1) returning id`,
    [agent],
  );
  const [property] = await db.rows<{ id: string }>(
    `insert into public.properties (listing_code, category, property_type, monthly_rent_minor, created_by)
     values ('FIN-' || substr(gen_random_uuid()::text, 1, 8), 'residential', 'apartment', 1, $1)
     returning id`,
    [ids.admin],
  );
  const stage = o.stage ?? "negotiation";
  const [deal] = await db.rows<{ id: string }>(
    `insert into public.rental_deals
       (lead_id, property_id, agent_id, landlord_id, agreed_monthly_rent_minor, currency,
        lease_start, lease_end, stage, closing_date, agreement_reference,
        commission_method, commission_rate, commission_fixed_minor,
        agent_share_method, agent_share_rate, agent_share_fixed_minor, status_reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     returning id`,
    [
      lead!.id,
      property!.id,
      agent,
      o.landlord === undefined ? ids.landlordA : o.landlord,
      o.rent ?? 100000,
      o.currency ?? "USD",
      o.start ?? "2031-01-01",
      o.end ?? "2031-12-31",
      stage,
      o.closing === undefined ? (stage === "closed_won" ? "2031-01-01" : null) : o.closing,
      o.agreement === undefined ? (stage === "closed_won" ? "AGR-1" : null) : o.agreement,
      o.method === undefined ? "fixed_amount" : o.method,
      o.rate ?? null,
      o.fixed === undefined ? (o.method === undefined ? 40000 : null) : o.fixed,
      o.shareMethod ?? "none",
      o.shareRate ?? null,
      o.shareFixed ?? null,
      o.reason ?? null,
    ],
  );
  return deal!.id;
}

async function receivable(db: Session, deal: string, amount: number, payer = "landlord") {
  const [row] = await db.rows<{ id: string }>(
    `insert into public.commissions (deal_id, fee_payer, calculation_type, agreed_amount_minor)
     values ($1, $2, 'fixed_amount', $3) returning id`,
    [deal, payer, amount],
  );
  return row!.id;
}

const entry = (
  commission: string,
  type: string,
  amount: number,
  extra: { reason?: string | null; reverses?: string | null; on?: string; method?: string | null } = {},
) => [
  `insert into public.commission_transactions
     (commission_id, entry_type, amount_minor, currency, occurred_on, payment_method, reference, reason, reverses_id)
   values ($1, $2, $3, 'USD', coalesce($4::date, current_date), $5, 'REF-1', $6, $7) returning id`,
  [
    commission,
    type,
    amount,
    extra.on ?? null,
    extra.method === undefined ? (type === "payment" ? "cash" : null) : extra.method,
    extra.reason ?? null,
    extra.reverses ?? null,
  ],
] as const;

suite("Finance: commission calculation (stored on the deal)", () => {
  const expected = async (db: Session, o: NewDeal) => {
    const id = await newDeal(db, o);
    const [row] = await db.rows<{ e: string | null; m: number | null; s: string | null }>(
      `select commission_expected_minor as e, lease_months as m, agent_share_expected_minor as s
       from public.rental_deals where id = $1`,
      [id],
    );
    return { expected: row!.e === null ? null : num(row!.e), months: row!.m, share: row!.s === null ? null : num(row!.s) };
  };

  it("fixed amount and custom agreed amount", async () => {
    await withFixtures(async (db) => {
      expect((await expected(db, { method: "fixed_amount", fixed: 25000 })).expected).toBe(25000);
      expect((await expected(db, { method: "custom_amount", fixed: 12345 })).expected).toBe(12345);
    });
  });

  it("percentage of one month's rent, rounded half up to a minor unit", async () => {
    await withFixtures(async (db) => {
      expect((await expected(db, { method: "percent_of_monthly_rent", rate: 50, fixed: null, rent: 90000 })).expected).toBe(45000);
      // 33.3333 % of 100000 = 33333.3 -> 33333
      expect((await expected(db, { method: "percent_of_monthly_rent", rate: 33.3333, fixed: null, rent: 100000 })).expected).toBe(33333);
      // 50 % of 1001 = 500.5 -> 501 (half up)
      expect((await expected(db, { method: "percent_of_monthly_rent", rate: 50, fixed: null, rent: 1001 })).expected).toBe(501);
      // 12.5 % of 10001 = 1250.125 -> 1250
      expect((await expected(db, { method: "percent_of_monthly_rent", rate: 12.5, fixed: null, rent: 10001 })).expected).toBe(1250);
    });
  });

  it("percentage of total contracted rent uses whole lease months", async () => {
    await withFixtures(async (db) => {
      const year = await expected(db, {
        method: "percent_of_total_rent", rate: 10, fixed: null, rent: 90000,
        start: "2031-01-01", end: "2031-12-31",
      });
      expect(year).toMatchObject({ months: 12, expected: 108000 }); // 90000 x 12 x 10 %

      const oneMonth = await expected(db, {
        method: "percent_of_total_rent", rate: 5, fixed: null, rent: 100000,
        start: "2031-01-15", end: "2031-02-14",
      });
      expect(oneMonth).toMatchObject({ months: 1, expected: 5000 });
    });
  });

  it("is not computed from incomplete information", async () => {
    await withFixtures(async (db) => {
      const shortLease = await expected(db, {
        method: "percent_of_total_rent", rate: 10, fixed: null, start: "2031-01-01", end: "2031-01-20",
      });
      expect(shortLease).toMatchObject({ months: null, expected: null });
      expect((await expected(db, { method: null, fixed: null })).expected).toBeNull();
    });
  });

  it("computes the agent's share separately and never above the commission", async () => {
    await withFixtures(async (db) => {
      const pct = await expected(db, {
        method: "fixed_amount", fixed: 90000, shareMethod: "percent_of_commission", shareRate: 40,
      });
      expect(pct).toMatchObject({ expected: 90000, share: 36000 });
      const fixed = await expected(db, {
        method: "fixed_amount", fixed: 90000, shareMethod: "fixed_amount", shareFixed: 15000,
      });
      expect(fixed.share).toBe(15000);

      const err = await db.denied(
        `insert into public.rental_deals (lead_id, property_id, agent_id, agreed_monthly_rent_minor,
           commission_method, commission_fixed_minor, agent_share_method, agent_share_fixed_minor)
         select l.id, p.id, $1, 1, 'fixed_amount', 1000, 'fixed_amount', 2000
         from public.leads l, public.properties p limit 1`,
        [ids.agentA],
      );
      expect(err.code).toBe(CHECK_VIOLATION);
    });
  });

  it("rejects arrangements that do not match their method", async () => {
    await withFixtures(async (db) => {
      const err = await db.denied(
        `update public.rental_deals set commission_method = 'percent_of_monthly_rent',
           commission_rate = null, commission_fixed_minor = 100 where id = $1`,
        [ids.dealA],
      );
      expect(err.constraint ?? err.code).toMatch(/commission_arrangement|42501|23514/);
    });
  });

  it("keeps a historical deal's arrangement when agency defaults change", async () => {
    await withFixtures(async (db) => {
      const id = await newDeal(db, { method: "percent_of_monthly_rent", rate: 50, fixed: null, rent: 90000 });
      await db.query_ok(
        `update public.finance_settings set default_commission_method = 'fixed_amount',
           default_commission_fixed_minor = 1, default_commission_rate = null`,
      );
      const [row] = await db.rows<{ e: string; r: string }>(
        "select commission_expected_minor e, commission_rate r from public.rental_deals where id = $1",
        [id],
      );
      expect(num(row!.e)).toBe(45000);
      expect(num(row!.r)).toBe(50);
    });
  });
});

suite("Finance: deal status rules", () => {
  it("only closes a deal as won when the required information is complete", async () => {
    await withFixtures(async (db) => {
      const id = await newDeal(db, { stage: "agreement_pending", landlord: null });
      const missing = await db.denied("update public.rental_deals set stage = 'closed_won' where id = $1", [id]);
      expect(missing.code).toBe(CHECK_VIOLATION);
      expect(missing.constraint).toBe("rental_deals_won_needs_terms");

      await db.query_ok(
        `update public.rental_deals set landlord_id = $2, closing_date = '2031-01-01',
           agreement_reference = 'AGR-77' where id = $1`,
        [id, ids.landlordA],
      );
      expect(
        await db.count("update public.rental_deals set stage = 'closed_won' where id = $1", [id]),
      ).toBe(1);
    });
  });

  it("follows the allowed status transitions", async () => {
    await withFixtures(async (db) => {
      const id = await newDeal(db);
      const go = (stage: string, reason?: string) =>
        db.count("update public.rental_deals set stage = $2, status_reason = coalesce($3, status_reason) where id = $1", [
          id, stage, reason ?? null,
        ]);
      expect(await go("reserved")).toBe(1);
      expect(await go("agreement_pending")).toBe(1);
      const skip = await db.denied(
        "update public.rental_deals set stage = 'lease_expired' where id = $1", [id],
      );
      expect(skip.code).toBe(CHECK_VIOLATION);
      await db.query_ok(
        `update public.rental_deals set landlord_id = $2, closing_date = '2031-01-01',
           agreement_reference = 'AGR' where id = $1`,
        [id, ids.landlordA],
      );
      expect(await go("closed_won")).toBe(1);
      const back = await db.denied("update public.rental_deals set stage = 'negotiation' where id = $1", [id]);
      expect(back.code).toBe(CHECK_VIOLATION);
      expect(await go("lease_expired")).toBe(1);
      const ended = await db.denied("update public.rental_deals set stage = 'closed_won' where id = $1", [id]);
      expect(ended.code).toBe(CHECK_VIOLATION);
    });
  });

  it("requires a reason to lose or cancel, and marks the lead won on closing", async () => {
    await withFixtures(async (db) => {
      const lost = await newDeal(db);
      const err = await db.denied("update public.rental_deals set stage = 'closed_lost' where id = $1", [lost]);
      expect(err.constraint).toBe("rental_deals_ended_needs_reason");
      expect(
        await db.count(
          "update public.rental_deals set stage = 'closed_lost', status_reason = 'Chose another' where id = $1",
          [lost],
        ),
      ).toBe(1);

      const won = await newDeal(db, { stage: "negotiation" });
      await db.query_ok(
        `update public.rental_deals set stage = 'agreement_pending' where id = $1`, [won]);
      await db.query_ok(
        `update public.rental_deals set landlord_id = $2, closing_date = '2031-01-01', agreement_reference = 'A'
         where id = $1`, [won, ids.landlordA]);
      await db.query_ok("update public.rental_deals set stage = 'closed_won' where id = $1", [won]);
      const [lead] = await db.rows<{ stage: string }>(
        "select l.stage from public.leads l join public.rental_deals d on d.lead_id = l.id where d.id = $1",
        [won],
      );
      expect(lead?.stage).toBe("won");
    });
  });

  it("lets an agent work a deal up to the agreement but not close or cancel it", async () => {
    await withFixtures(async (db) => {
      const id = await newDeal(db, { stage: "agreement_pending", closing: "2031-01-01", agreement: "AGR-9" });
      await db.as("agentA");
      const close = await db.denied("update public.rental_deals set stage = 'closed_won' where id = $1", [id]);
      expect(close.code).toBe(INSUFFICIENT_PRIVILEGE);
      const cancel = await db.denied(
        "update public.rental_deals set stage = 'cancelled', status_reason = 'x' where id = $1", [id]);
      expect(cancel.code).toBe(INSUFFICIENT_PRIVILEGE);
      expect(
        await db.count("update public.rental_deals set stage = 'reserved' where id = $1", [id]),
      ).toBe(1);

      await db.as("manager");
      await db.query_ok("update public.rental_deals set stage = 'agreement_pending' where id = $1", [id]);
      expect(
        await db.count("update public.rental_deals set stage = 'closed_won' where id = $1", [id]),
      ).toBe(1);
    });
  });

  it("prevents a duplicate active deal and overlapping signed leases", async () => {
    await withFixtures(async (db) => {
      const id = await newDeal(db);
      const [d] = await db.rows<{ lead_id: string; property_id: string }>(
        "select lead_id, property_id from public.rental_deals where id = $1", [id]);
      const dup = await db.denied(
        `insert into public.rental_deals (lead_id, property_id, agent_id, stage)
         values ($1, $2, $3, 'reserved')`,
        [d!.lead_id, d!.property_id, ids.agentA],
      );
      expect(dup.code).toBe(UNIQUE_VIOLATION);

      // A cancelled deal no longer blocks a new one for the same transaction.
      await db.query_ok(
        "update public.rental_deals set stage = 'cancelled', status_reason = 'x' where id = $1", [id]);
      expect(
        await db.count(
          `insert into public.rental_deals (lead_id, property_id, agent_id, stage)
           values ($1, $2, $3, 'negotiation')`,
          [d!.lead_id, d!.property_id, ids.agentA],
        ),
      ).toBe(1);

      // Two signed leases on one property may not overlap.
      const first = await newDeal(db, { stage: "closed_won", start: "2032-01-01", end: "2032-12-31" });
      const [p] = await db.rows<{ property_id: string }>(
        "select property_id from public.rental_deals where id = $1", [first]);
      const [otherLead] = await db.rows<{ id: string }>(
        "insert into public.leads (customer_name, email) values ('Other', 'o@x.invalid') returning id");
      const overlap = await db.denied(
        `insert into public.rental_deals
           (lead_id, property_id, agent_id, landlord_id, agreed_monthly_rent_minor, lease_start, lease_end,
            stage, closing_date, agreement_reference, commission_method, commission_fixed_minor)
         values ($1, $2, $3, $4, 1000, '2032-06-01', '2033-05-31', 'closed_won', '2032-06-01', 'A2',
                 'fixed_amount', 1)`,
        [otherLead!.id, p!.property_id, ids.agentA, ids.landlordA],
      );
      expect(overlap.code).toBe(EXCLUSION_VIOLATION);
    });
  });

  it("freezes the terms of a closed deal", async () => {
    await withFixtures(async (db) => {
      const id = await newDeal(db, { stage: "closed_won" });
      for (const change of [
        "agreed_monthly_rent_minor = 1",
        "commission_fixed_minor = 1",
        "agent_share_method = 'fixed_amount', agent_share_fixed_minor = 1",
        "lease_end = '2031-06-30'",
      ]) {
        const err = await db.denied(`update public.rental_deals set ${change} where id = $1`, [id]);
        expect(err.code, change).toBe(CHECK_VIOLATION);
      }
      expect(
        await db.count("update public.rental_deals set notes = 'still editable' where id = $1", [id]),
      ).toBe(1);
    });
  });
});

suite("Finance: receivable ledger", () => {
  it("supports several partial payments and derives the balance from the ledger", async () => {
    await withFixtures(async (db) => {
      await db.as("finance");
      await db.query_ok(...entry(ids.commissionA, "payment", 10000));
      await db.query_ok(...entry(ids.commissionA, "payment", 15000, { method: "bank_transfer" }));

      const [b] = await db.rows<Record<string, string>>(
        `select due_minor, collected_minor, outstanding_minor, collection_status
         from public.commission_balances where commission_id = $1`,
        [ids.commissionA],
      );
      expect(num(b!.due_minor)).toBe(40000);
      expect(num(b!.collected_minor)).toBe(25000);
      expect(num(b!.outstanding_minor)).toBe(15000);
      expect(b!.collection_status).toBe("partially_paid");

      // The cached columns equal the ledger, not an independent number.
      const [sum] = await db.rows<{ s: string }>(
        `select sum(amount_minor) s from public.commission_transactions
         where commission_id = $1 and entry_type = 'payment'`,
        [ids.commissionA],
      );
      const [cached] = await db.rows<{ c: string; st: string }>(
        "select amount_paid_minor c, payment_status st from public.commissions where id = $1",
        [ids.commissionA],
      );
      expect(num(cached!.c)).toBe(num(sum!.s));
      expect(cached!.st).toBe("partial");

      await db.query_ok(...entry(ids.commissionA, "payment", 15000));
      const [paid] = await db.rows<{ collection_status: string; outstanding_minor: string }>(
        "select collection_status, outstanding_minor from public.commission_balances where commission_id = $1",
        [ids.commissionA],
      );
      expect(paid).toMatchObject({ collection_status: "paid", outstanding_minor: "0" });
    });
  });

  it("refuses overpayment, zero and negative amounts, and future dates", async () => {
    await withFixtures(async (db) => {
      await db.as("finance");
      expect((await db.denied(...entry(ids.commissionA, "payment", 40001))).code).toBe(CHECK_VIOLATION);
      expect((await db.denied(...entry(ids.commissionA, "payment", 0))).code).toBe(CHECK_VIOLATION);
      expect((await db.denied(...entry(ids.commissionA, "payment", -5))).code).toBe(CHECK_VIOLATION);
      const future = await db.denied(
        ...entry(ids.commissionA, "payment", 10, { on: "2999-01-01" }),
      );
      expect(future.code).toBe(CHECK_VIOLATION);
      const noMethod = await db.denied(...entry(ids.commissionA, "payment", 10, { method: null }));
      expect(noMethod.code).toBe(CHECK_VIOLATION);
    });
  });

  it("corrects mistakes with reversals, adjustments and write-offs, each needing a reason", async () => {
    await withFixtures(async (db) => {
      await db.as("finance");
      const [pay] = await db.rows<{ id: string }>(...entry(ids.commissionA, "payment", 30000));

      // Reversal needs a reason and cannot exceed the payment.
      expect((await db.denied(...entry(ids.commissionA, "reversal", 1000, { reverses: pay!.id }))).code)
        .toBe(CHECK_VIOLATION);
      await db.query_ok(...entry(ids.commissionA, "reversal", 10000, { reverses: pay!.id, reason: "Entered twice" }));
      expect((await db.denied(...entry(ids.commissionA, "reversal", 25000, { reverses: pay!.id, reason: "x" }))).code)
        .toBe(CHECK_VIOLATION);

      const read = async () => {
        const [r] = await db.rows<Record<string, string>>(
          "select collected_minor, outstanding_minor, due_minor, collection_status from public.commission_balances where commission_id = $1",
          [ids.commissionA],
        );
        return r!;
      };
      let b = await read();
      expect(num(b.collected_minor)).toBe(20000);
      expect(num(b.outstanding_minor)).toBe(20000);

      // Adjustments change the amount due, with a reason.
      expect((await db.denied(...entry(ids.commissionA, "adjustment_up", 500))).code).toBe(CHECK_VIOLATION);
      await db.query_ok(...entry(ids.commissionA, "adjustment_up", 5000, { reason: "Extra service fee agreed" }));
      b = await read();
      expect(num(b.due_minor)).toBe(45000);
      expect(num(b.outstanding_minor)).toBe(25000);
      expect((await db.denied(...entry(ids.commissionA, "adjustment_down", 25001, { reason: "x" }))).code)
        .toBe(CHECK_VIOLATION);

      // Write the rest off: nothing outstanding, status written off, cash untouched.
      await db.query_ok(...entry(ids.commissionA, "write_off", 25000, { reason: "Tenant left, uncollectable" }));
      b = await read();
      expect(num(b.outstanding_minor)).toBe(0);
      expect(num(b.collected_minor)).toBe(20000);
      expect(b.collection_status).toBe("written_off");
    });
  });

  it("is append-only for everyone, and stores the commission's currency", async () => {
    await withFixtures(async (db) => {
      await db.as("finance");
      const [row] = await db.rows<{ id: string; currency: string }>(
        `insert into public.commission_transactions
           (commission_id, entry_type, amount_minor, currency, occurred_on, payment_method)
         values ($1, 'payment', 100, 'KHR', current_date, 'cash') returning id, currency`,
        [ids.commissionA],
      );
      expect(row!.currency).toBe("USD");

      await db.as("admin");
      for (const sql of [
        "update public.commission_transactions set amount_minor = 1 where id = $1",
        "delete from public.commission_transactions where id = $1",
      ]) {
        expect((await db.denied(sql, [row!.id])).code).toBe(INSUFFICIENT_PRIVILEGE);
      }
    });
  });

  it("derives not due / due / overdue from the due date", async () => {
    await withFixtures(async (db) => {
      const status = async () => {
        const [r] = await db.rows<{ collection_status: string }>(
          "select collection_status from public.commission_balances where commission_id = $1",
          [ids.commissionA],
        );
        return r!.collection_status;
      };
      expect(await status()).toBe("not_due");
      await db.query_ok("update public.commissions set due_date = current_date + 5 where id = $1", [ids.commissionA]);
      expect(await status()).toBe("not_due");
      await db.query_ok("update public.commissions set due_date = current_date where id = $1", [ids.commissionA]);
      expect(await status()).toBe("due");
      await db.query_ok("update public.commissions set due_date = current_date - 1 where id = $1", [ids.commissionA]);
      expect(await status()).toBe("overdue");
    });
  });

  it("limits who may record entries", async () => {
    await withFixtures(async (db) => {
      for (const who of ["manager", "agentA", "marketing"] as const) {
        await db.as(who);
        const err = await db.denied(...entry(ids.commissionA, "payment", 100));
        expect(err.code, who).toBe(INSUFFICIENT_PRIVILEGE);
      }
      await db.as("admin");
      await db.query_ok(...entry(ids.commissionA, "payment", 100));
    });
  });

  it("only raises receivables on closed deals, within the expected commission", async () => {
    await withFixtures(async (db) => {
      const open = await newDeal(db, { stage: "negotiation" });
      expect((await db.denied(
        `insert into public.commissions (deal_id, fee_payer, calculation_type, agreed_amount_minor)
         values ($1, 'landlord', 'fixed_amount', 100)`, [open])).code).toBe(CHECK_VIOLATION);

      const won = await newDeal(db, { stage: "closed_won", fixed: 50000 });
      await receivable(db, won, 30000, "landlord");
      await receivable(db, won, 20000, "tenant"); // exactly the expected total
      const over = await db.denied(
        `insert into public.commissions (deal_id, fee_payer, calculation_type, agreed_amount_minor)
         values ($1, 'other', 'fixed_amount', 1)`, [won]);
      expect(over.code).toBe(CHECK_VIOLATION);
    });
  });

  it("agents see their own deals' balances but cannot write the ledger", async () => {
    await withFixtures(async (db) => {
      await db.as("agentA");
      const mine = await db.rows("select 1 from public.commission_balances where commission_id in ($1, $2)",
        [ids.commissionA, ids.commissionB]);
      expect(mine).toHaveLength(1);
      expect(await db.rows("select 1 from public.commission_transactions")).toHaveLength(0);
    });
  });
});

suite("Finance: agent payouts", () => {
  // dealA: commission 40000, agent share 50 % = 20000; receivable 40000.
  const request = (amount: number) =>
    [
      `insert into public.agent_payouts (deal_id, amount_minor, currency, agent_id, requested_by)
       values ($1, $2, 'USD', $3, $4) returning id`,
      [ids.dealA, amount, ids.agentB /* ignored: forced to the deal's agent */, ids.finance],
    ] as const;

  async function collect(db: Session, amount: number) {
    await db.query_ok(...entry(ids.commissionA, "payment", amount));
  }

  it("makes only the collected part of the share eligible, and supports partial payouts", async () => {
    await withFixtures(async (db) => {
      const eligible = async () => {
        const [r] = await db.rows<Record<string, string>>(
          `select agent_share_minor, agent_eligible_minor, agent_paid_minor, agent_pending_minor,
                  agent_outstanding_minor from public.deal_financials where deal_id = $1`,
          [ids.dealA],
        );
        return r!;
      };
      let f = await eligible();
      expect(num(f.agent_share_minor)).toBe(20000);
      expect(num(f.agent_eligible_minor)).toBe(0);

      // Nothing is eligible before anything is collected.
      await db.as("finance");
      expect((await db.denied(...request(1))).code).toBe(CHECK_VIOLATION);

      await db.as("admin");
      await collect(db, 20000); // half the commission -> half the share
      f = await eligible();
      expect(num(f.agent_eligible_minor)).toBe(10000);

      await db.as("finance");
      await db.query_ok(...request(6000));
      expect((await db.denied(...request(5000))).code).toBe(CHECK_VIOLATION); // only 4000 left
      await db.query_ok(...request(4000));

      const [row] = await db.rows<{ agent_id: string }>(
        "select agent_id from public.agent_payouts where deal_id = $1 limit 1", [ids.dealA]);
      expect(row!.agent_id).toBe(ids.agentA);

      f = await eligible();
      expect(num(f.agent_pending_minor)).toBe(10000);
      expect(num(f.agent_outstanding_minor)).toBe(10000);
    });
  });

  it("enforces approval permissions and four-eyes", async () => {
    await withFixtures(async (db) => {
      await db.as("admin");
      await collect(db, 40000);
      await db.as("finance");
      const [p] = await db.rows<{ id: string }>(...request(5000));

      // Finance created the request and may not approve it.
      expect((await db.denied(
        "update public.agent_payouts set status = 'approved' where id = $1", [p!.id])).code)
        .toBe(INSUFFICIENT_PRIVILEGE);
      // Not paid before it is approved.
      expect((await db.denied(
        `update public.agent_payouts set status = 'paid', paid_on = current_date,
           payment_method = 'cash', payment_reference = 'R' where id = $1`, [p!.id])).code)
        .toBe(CHECK_VIOLATION);

      await db.as("agentA");
      expect(await db.count("update public.agent_payouts set status = 'approved' where id = $1", [p!.id])).toBe(0);

      await db.as("manager");
      expect(await db.count("update public.agent_payouts set status = 'approved' where id = $1", [p!.id])).toBe(1);
      // Managers approve; they do not pay.
      expect((await db.denied(
        `update public.agent_payouts set status = 'paid', paid_on = current_date,
           payment_method = 'cash', payment_reference = 'R' where id = $1`, [p!.id])).code)
        .toBe(INSUFFICIENT_PRIVILEGE);

      await db.as("finance");
      expect((await db.denied(
        `update public.agent_payouts set status = 'paid', paid_on = current_date,
           payment_method = 'cash' where id = $1`, [p!.id])).code).toBe(CHECK_VIOLATION); // no reference
      expect(await db.count(
        `update public.agent_payouts set status = 'paid', paid_on = current_date,
           payment_method = 'bank_transfer', payment_reference = 'TX-1' where id = $1`, [p!.id])).toBe(1);

      const [f] = await db.rows<Record<string, string>>(
        "select agent_paid_minor, agent_outstanding_minor from public.deal_financials where deal_id = $1",
        [ids.dealA]);
      expect(num(f!.agent_paid_minor)).toBe(5000);
      expect(num(f!.agent_outstanding_minor)).toBe(15000); // 20000 eligible - 5000 paid

      // A paid payout's amount can never change.
      expect((await db.denied(
        "update public.agent_payouts set amount_minor = 1 where id = $1", [p!.id])).code)
        .toBe(INSUFFICIENT_PRIVILEGE); // no column privilege
    });
  });

  it("does not let a requester approve their own payout, except a sole super admin", async () => {
    await withFixtures(async (db) => {
      await db.as("admin");
      await collect(db, 40000);
      await db.as("manager");
      const [p] = await db.rows<{ id: string }>(...request(1000));
      expect((await db.denied(
        "update public.agent_payouts set status = 'approved' where id = $1", [p!.id])).code)
        .toBe(INSUFFICIENT_PRIVILEGE);
      await db.as("admin");
      expect(await db.count("update public.agent_payouts set status = 'approved' where id = $1", [p!.id])).toBe(1);
    });
  });

  it("requires a reason to reject or reverse, and agents see only their own payouts", async () => {
    await withFixtures(async (db) => {
      await db.as("admin");
      await collect(db, 40000);
      await db.as("finance");
      const [p] = await db.rows<{ id: string }>(...request(2000));
      await db.as("manager");
      expect((await db.denied(
        "update public.agent_payouts set status = 'rejected' where id = $1", [p!.id])).code)
        .toBe(CHECK_VIOLATION);
      expect(await db.count(
        "update public.agent_payouts set status = 'rejected', reason = 'Wrong bank details' where id = $1",
        [p!.id])).toBe(1);

      // After rejection the amount is eligible again.
      await db.as("finance");
      await db.query_ok(...request(20000));

      await db.as("agentA");
      expect(await db.rows("select 1 from public.agent_payouts")).toHaveLength(2);
      await db.as("agentB");
      expect(await db.rows("select 1 from public.agent_payouts")).toHaveLength(0);
      await db.as("marketing");
      expect(await db.rows("select 1 from public.agent_payouts")).toHaveLength(0);
    });
  });

  it("re-checks eligibility at approval when a collection is reversed", async () => {
    await withFixtures(async (db) => {
      await db.as("finance");
      const [pay] = await db.rows<{ id: string }>(...entry(ids.commissionA, "payment", 40000));
      const [p] = await db.rows<{ id: string }>(...request(20000));
      await db.query_ok(...entry(ids.commissionA, "reversal", 40000, { reverses: pay!.id, reason: "Bounced" }));
      await db.as("manager");
      expect((await db.denied(
        "update public.agent_payouts set status = 'approved' where id = $1", [p!.id])).code)
        .toBe(CHECK_VIOLATION);
    });
  });

  it("can use the agency's 'on earned' rule instead", async () => {
    await withFixtures(async (db) => {
      await db.query_ok("update public.finance_settings set payout_eligibility_rule = 'on_earned'");
      await db.as("finance");
      await db.query_ok(...request(20000)); // the whole share, nothing collected yet
    });
  });
});

suite("Finance: expenses", () => {
  const create = (amount = 2500, currency = "USD") => [
    `insert into public.expenses (expense_date, category, description, amount_minor, currency, vendor)
     values (current_date, 'advertising', 'Ad boost', $1, $2, 'Ads Co') returning id, status, created_by`,
    [amount, currency],
  ] as const;

  it("starts pending, records the creator, and only managers approve", async () => {
    await withFixtures(async (db) => {
      await db.as("finance");
      const [e] = await db.rows<{ id: string; status: string; created_by: string }>(...create());
      expect(e).toMatchObject({ status: "pending", created_by: ids.finance });
      // Not by the creator's role, and not forged via the insert.
      expect((await db.denied(
        "update public.expenses set status = 'approved' where id = $1", [e!.id])).code)
        .toBe(INSUFFICIENT_PRIVILEGE);

      await db.as("manager");
      expect(await db.count("update public.expenses set status = 'approved' where id = $1", [e!.id])).toBe(1);
      const [row] = await db.rows<{ approved_by: string; approved_at: string | null }>(
        "select approved_by, approved_at from public.expenses where id = $1", [e!.id]);
      expect(row!.approved_by).toBe(ids.manager);
      expect(row!.approved_at).not.toBeNull();

      // A decided expense cannot be edited or decided again.
      expect((await db.denied(
        "update public.expenses set amount_minor = 1 where id = $1", [e!.id])).code).toBe(CHECK_VIOLATION);
      expect((await db.denied(
        "update public.expenses set status = 'rejected', rejection_reason = 'x' where id = $1", [e!.id])).code)
        .toBe(CHECK_VIOLATION);
    });
  });

  it("does not let a manager approve their own expense; rejection needs a reason", async () => {
    await withFixtures(async (db) => {
      await db.as("manager");
      const [e] = await db.rows<{ id: string }>(...create());
      expect((await db.denied(
        "update public.expenses set status = 'approved' where id = $1", [e!.id])).code)
        .toBe(INSUFFICIENT_PRIVILEGE);
      await db.as("finance");
      const [f] = await db.rows<{ id: string }>(...create());
      await db.as("manager");
      expect((await db.denied(
        "update public.expenses set status = 'rejected' where id = $1", [f!.id])).code).toBe(CHECK_VIOLATION);
      expect(await db.count(
        "update public.expenses set status = 'rejected', rejection_reason = 'Duplicate' where id = $1", [f!.id]))
        .toBe(1);
    });
  });

  it("is invisible to agents and marketing, and cannot be created by them", async () => {
    await withFixtures(async (db) => {
      await db.as("finance");
      await db.query_ok(...create());
      for (const who of ["agentA", "marketing", "outsider"] as const) {
        await db.as(who);
        expect(await db.rows("select 1 from public.expenses"), who).toHaveLength(0);
        expect((await db.denied(...create())).code, who).toBe(INSUFFICIENT_PRIVILEGE);
      }
    });
  });

  it("rejects zero, negative and future-dated expenses and cannot be deleted", async () => {
    await withFixtures(async (db) => {
      await db.as("finance");
      expect((await db.denied(...create(0))).code).toBe(CHECK_VIOLATION);
      expect((await db.denied(...create(-1))).code).toBe(CHECK_VIOLATION);
      expect((await db.denied(
        `insert into public.expenses (expense_date, category, description, amount_minor)
         values (current_date + 3, 'other', 'Future', 100)`)).code).toBe(CHECK_VIOLATION);
      const [e] = await db.rows<{ id: string }>(...create());
      expect((await db.denied("delete from public.expenses where id = $1", [e!.id])).code)
        .toBe(INSUFFICIENT_PRIVILEGE);
    });
  });
});

suite("Finance: audit trail", () => {
  it("logs financial entries with actor, time and reason, and cannot be altered", async () => {
    await withFixtures(async (db) => {
      await db.as("finance");
      await db.query_ok(...entry(ids.commissionA, "payment", 10000));
      await db.query_ok(...entry(ids.commissionA, "write_off", 1000, { reason: "Goodwill, agreed by owner" }));

      const rows = await db.rows<{ actor_id: string; actor_role: string; reason: string | null; deal_id: string }>(
        `select actor_id, actor_role, reason, deal_id from public.financial_audit_log
         where entity_type = 'commission_transactions' order by occurred_at, id`,
      );
      const write = rows.find((r) => r.reason === "Goodwill, agreed by owner");
      expect(write).toMatchObject({ actor_id: ids.finance, actor_role: "finance", deal_id: ids.dealA });

      await db.as("admin");
      expect((await db.denied("delete from public.financial_audit_log")).code).toBe(INSUFFICIENT_PRIVILEGE);
      expect((await db.denied("update public.financial_audit_log set reason = 'x'")).code)
        .toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it("logs deal changes and exports, and is readable by finance, managers and admins only", async () => {
    await withFixtures(async (db) => {
      await db.as("manager");
      await db.query_ok(
        "update public.rental_deals set stage = 'lease_expired' where id = $1", [ids.dealA]);
      await db.query_ok("select public.log_financial_export('commissions', '{\"rows\": 3}'::jsonb)");

      const rows = await db.rows<{ action: string; entity_type: string; actor_id: string }>(
        "select action, entity_type, actor_id from public.financial_audit_log where actor_id = $1", [ids.manager]);
      expect(rows.map((r) => `${r.action}:${r.entity_type}`)).toEqual(
        expect.arrayContaining(["update:rental_deals", "export:commissions"]),
      );

      await db.as("finance");
      expect((await db.rows("select 1 from public.financial_audit_log")).length).toBeGreaterThan(0);
      for (const who of ["agentA", "marketing", "outsider"] as const) {
        await db.as(who);
        expect(await db.rows("select 1 from public.financial_audit_log"), who).toHaveLength(0);
      }
      await db.as("anon");
      expect((await db.denied("select 1 from public.financial_audit_log")).code).toBe(INSUFFICIENT_PRIVILEGE);
      expect((await db.denied("select public.log_financial_export('x')")).code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });
});

suite("Finance: reports reconcile with the transactions", () => {
  it("totals equal the ledger, per currency, and revenue is commission only", async () => {
    await withFixtures(async (db) => {
      // Known USD and KHR activity on top of whatever the database holds.
      const khr = await newDeal(db, { stage: "closed_won", currency: "KHR", fixed: 500000, agent: ids.agentB });
      const khrRec = await receivable(db, khr, 500000);
      await db.as("finance");
      await db.query_ok(...entry(ids.commissionA, "payment", 25000));
      await db.query_ok(...entry(ids.commissionB, "payment", 40000));
      const [rev] = await db.rows<{ id: string }>(...entry(ids.commissionB, "payment", 5000));
      await db.query_ok(...entry(ids.commissionB, "reversal", 2000, { reverses: rev!.id, reason: "Typo" }));
      await db.query_ok(
        `insert into public.commission_transactions
           (commission_id, entry_type, amount_minor, currency, occurred_on, payment_method)
         values ($1, 'payment', 200000, 'KHR', current_date, 'cash')`, [khrRec]);

      const [report] = await db.rows<{ r: Report }>(
        "select public.finance_report(current_date - 30, current_date) as r");
      const r = report!.r;
      const usd = r.by_currency.find((c: Row) => c.currency === "USD")!;
      const khrRow = r.by_currency.find((c: Row) => c.currency === "KHR")!;

      // Independent truth straight from the ledger.
      const truth = async (currency: string) => {
        const [t] = await db.rows<{ n: string }>(
          `select coalesce(sum(case entry_type when 'payment' then amount_minor
                                 when 'reversal' then -amount_minor else 0 end), 0) n
           from public.commission_transactions
           where currency = $1 and occurred_on between current_date - 30 and current_date`, [currency]);
        return num(t!.n);
      };
      expect(num(usd.collected_minor)).toBe(await truth("USD"));
      expect(num(usd.cash_in_minor)).toBe(num(usd.collected_minor));
      expect(num(khrRow.collected_minor)).toBe(await truth("KHR"));
      expect(num(khrRow.collected_minor)).toBeGreaterThanOrEqual(200000);
      // Currencies are never combined.
      expect(num(usd.collected_minor)).not.toBe(num(usd.collected_minor) + num(khrRow.collected_minor));

      // Revenue by agent and by property type each add up to what was collected.
      const sum = (rows: Row[], currency: string) =>
        rows.filter((x) => x.currency === currency).reduce((a, x) => a + num(x.collected_minor), 0);
      expect(sum(r.revenue_by_agent, "USD")).toBe(num(usd.collected_minor));
      expect(sum(r.revenue_by_property_type, "USD")).toBe(num(usd.collected_minor));
      expect(sum(r.revenue_by_agent, "KHR")).toBe(num(khrRow.collected_minor));

      // Outstanding comes from balances; the deposit and rent are not revenue.
      const [bal] = await db.rows<{ n: string }>(
        "select coalesce(sum(outstanding_minor),0) n from public.commission_balances where currency = 'USD'");
      expect(num(usd.outstanding_minor)).toBe(num(bal!.n));
      const [rent] = await db.rows<{ n: string }>(
        "select coalesce(sum(agreed_monthly_rent_minor),0) n from public.rental_deals where currency = 'USD'");
      expect(num(usd.collected_minor)).toBeLessThan(num(rent!.n) * 12);
    });
  });

  it("keeps unapproved expenses and unpaid payouts out of cash, and counts approved paid ones", async () => {
    await withFixtures(async (db) => {
      const base = async () => {
        const [row] = await db.rows<{ r: Report }>(
          "select public.finance_report(current_date - 7, current_date) as r");
        return row!.r.by_currency.find((c: Row) => c.currency === "USD")!;
      };
      await db.as("finance");
      const before = await base();
      const [e] = await db.rows<{ id: string }>(
        `insert into public.expenses (expense_date, category, description, amount_minor)
         values (current_date, 'utilities', 'Power', 7000) returning id`);
      let now = await base();
      expect(num(now.expenses_pending_minor) - num(before.expenses_pending_minor)).toBe(7000);
      expect(num(now.expenses_approved_minor)).toBe(num(before.expenses_approved_minor));
      expect(num(now.cash_out_minor)).toBe(num(before.cash_out_minor));

      await db.as("manager");
      await db.query_ok("update public.expenses set status = 'approved' where id = $1", [e!.id]);
      now = await base();
      expect(num(now.expenses_approved_minor) - num(before.expenses_approved_minor)).toBe(7000);
      // Approved but not yet paid is a commitment, not cash out.
      expect(num(now.cash_out_minor)).toBe(num(before.cash_out_minor));

      await db.as("finance");
      await db.query_ok("update public.expenses set paid_on = current_date where id = $1", [e!.id]);
      now = await base();
      expect(num(now.cash_out_minor) - num(before.cash_out_minor)).toBe(7000);
      expect(num(now.net_minor)).toBe(num(now.cash_in_minor) - num(now.cash_out_minor));
    });
  });

  it("is limited by row level security for agents, and unavailable to the public", async () => {
    await withFixtures(async (db) => {
      await db.as("finance");
      await db.query_ok(...entry(ids.commissionA, "payment", 100));
      await db.query_ok(...entry(ids.commissionB, "payment", 200));
      await db.as("agentA");
      const [row] = await db.rows<{ r: Report }>(
        "select public.finance_report(current_date - 1, current_date) as r");
      const byAgent = row!.r.revenue_by_agent as Array<{ agent_id: string }>;
      expect(byAgent.every((x) => x.agent_id === ids.agentA)).toBe(true);
      await db.as("anon");
      expect((await db.denied("select public.finance_report(current_date, current_date)")).code)
        .toBe(INSUFFICIENT_PRIVILEGE);
      for (const view of ["commission_balances", "deal_financials", "deal_overview"]) {
        expect((await db.denied(`select * from public.${view}`)).code, view).toBe(INSUFFICIENT_PRIVILEGE);
      }
    });
  });
});

suite("Finance: deal names without lead or landlord access", () => {
  it("shows finance the customer and landlord names on a deal, not the records", async () => {
    await withFixtures(async (db) => {
      await db.as("finance");
      const [row] = await db.rows<{ customer_name: string; landlord_name: string }>(
        "select customer_name, landlord_name from public.deal_overview where id = $1", [ids.dealA]);
      expect(row).toMatchObject({ customer_name: "Customer A", landlord_name: "Landlord A" });
      expect(await db.rows("select 1 from public.leads")).toHaveLength(0);
      expect(await db.rows("select 1 from public.landlords")).toHaveLength(0);

      await db.as("agentB");
      expect(await db.rows("select 1 from public.deal_overview where id = $1", [ids.dealA])).toHaveLength(0);
    });
  });
});

suite("Finance: concurrent entries", () => {
  it("serialises two payments recorded at the same moment against the real balance", async () => {
    // Uses the committed development seed's staff and landlord.
    const SEED = {
      admin: "10000000-0000-0000-0000-000000000001",
      agent: "10000000-0000-0000-0000-000000000003",
      finance: "10000000-0000-0000-0000-000000000006",
      landlord: "20000000-0000-0000-0000-000000000001",
    };
    const { Client } = await import("pg");
    const url = getTestDatabaseUrl()!;
    const admin = new Client({ connectionString: url });
    await admin.connect();
    try {
      // Committed fixtures (the ledger is append-only, so a rollback-based test
      // cannot show concurrency). Unique ids; harmless in a local database.
      const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
      const [lead] = await q(
        "insert into public.leads (customer_name, email) values ('Concurrent', 'c@x.invalid') returning id");
      const [property] = await q(
        `insert into public.properties (listing_code, category, property_type, monthly_rent_minor, created_by)
         values ('CON-' || substr(gen_random_uuid()::text, 1, 8), 'residential', 'apartment', 1, $1) returning id`,
        [SEED.admin]);
      const [deal] = await q(
        `insert into public.rental_deals
           (lead_id, property_id, agent_id, landlord_id, agreed_monthly_rent_minor, lease_start, lease_end,
            stage, closing_date, agreement_reference, commission_method, commission_fixed_minor)
         values ($1, $2, $3, $4, 1000, '2040-01-01', '2040-12-31', 'closed_won', '2040-01-01', 'CON',
                 'fixed_amount', 100000) returning id`,
        [lead.id, property.id, SEED.agent, SEED.landlord]);
      const [commission] = await q(
        `insert into public.commissions (deal_id, fee_payer, calculation_type, agreed_amount_minor)
         values ($1, 'landlord', 'fixed_amount', 100000) returning id`, [deal.id]);

      const pay = async () => {
        const client = new Client({ connectionString: url });
        await client.connect();
        try {
          await client.query("begin");
          await client.query("select set_config('request.jwt.claims', $1, true)", [
            JSON.stringify({ sub: SEED.finance, role: "authenticated" }),
          ]);
          await client.query("set local role authenticated");
          await client.query(
            `insert into public.commission_transactions
               (commission_id, entry_type, amount_minor, currency, occurred_on, payment_method)
             values ($1, 'payment', 70000, 'USD', current_date, 'cash')`, [commission.id]);
          // Hold the transaction open briefly so the two really overlap.
          await new Promise((resolve) => setTimeout(resolve, 150));
          await client.query("commit");
        } catch (error) {
          await client.query("rollback").catch(() => undefined);
          throw error;
        } finally {
          await client.end();
        }
      };

      const results = await Promise.allSettled([pay(), pay()]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

      const [balance] = await q(
        `select amount_paid_minor::int paid, (agreed_amount_minor + adjustment_minor - amount_paid_minor)::int outstanding
         from public.commissions where id = $1`, [commission.id]);
      expect(balance).toEqual({ paid: 70000, outstanding: 30000 });
    } finally {
      await admin.end();
    }
  });
});
