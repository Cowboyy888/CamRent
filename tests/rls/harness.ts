import { Client, type DatabaseError } from "pg";

/**
 * Database test harness. These tests run real SQL against a LOCAL Supabase
 * Postgres (see docs/rls-testing.md). Every test runs inside a transaction
 * that is rolled back, so nothing is left behind.
 *
 * Safety: the harness refuses any host other than localhost.
 */
const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

export function getTestDatabaseUrl(): string | undefined {
  const explicit = process.env.RLS_TEST_DATABASE_URL;
  if (explicit) return explicit;
  return process.env.RLS_TEST_LOCAL === "1" ? LOCAL_URL : undefined;
}

function assertLocal(url: string) {
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    throw new Error(
      `Refusing to run database tests against non-local host "${host}". ` +
        "These tests create and roll back fixture rows and must never touch a real project.",
    );
  }
}

/** Fixed fixture ids, in their own namespace so they never clash with seed data. */
const id = (kind: number, n: number) =>
  `f${kind.toString(16).padStart(7, "0")}-0000-4000-8000-${n.toString().padStart(12, "0")}`;

export const ids = {
  admin: id(1, 1),
  manager: id(1, 2),
  agentA: id(1, 3),
  agentB: id(1, 4),
  marketing: id(1, 5),
  finance: id(1, 6),
  /** Signed-in auth user with no staff profile. */
  outsider: id(1, 7),
  /** Staff profile that has been deactivated. */
  inactive: id(1, 8),

  landlordA: id(2, 1),
  landlordB: id(2, 2),
  landlordFree: id(2, 3),

  propPublished: id(3, 1), // published + available, belongs to agent B
  propDraftA: id(3, 2),
  propDraftB: id(3, 3),
  propRented: id(3, 4), // published but rented
  propArchived: id(3, 5),

  leadA: id(4, 1),
  leadB: id(4, 2),
  leadInactive: id(4, 3),

  dealA: id(5, 1),
  dealB: id(5, 2),
  commissionA: id(6, 1),
  commissionB: id(6, 2),
  taskA: id(7, 1),
  taskB: id(7, 2),
  activityA: id(8, 1),
  activityB: id(8, 2),
  mediaPublished: id(9, 1),
  mediaDraftB: id(9, 2),
} as const;

export type Who =
  | "anon"
  | "admin"
  | "manager"
  | "agentA"
  | "agentB"
  | "marketing"
  | "finance"
  | "outsider"
  | "inactive";

const fixtures = `
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ${(["admin", "manager", "agentA", "agentB", "marketing", "finance", "outsider", "inactive"] as const)
    .map(
      (k) =>
        `('00000000-0000-0000-0000-000000000000', '${ids[k]}', 'authenticated', 'authenticated', '${k}@rls-test.invalid', now(), now())`,
    )
    .join(",\n  ")};

insert into public.profiles (id, full_name, role, is_active) values
  ('${ids.admin}', 'Test Admin', 'super_admin', true),
  ('${ids.manager}', 'Test Manager', 'manager', true),
  ('${ids.agentA}', 'Test Agent A', 'agent', true),
  ('${ids.agentB}', 'Test Agent B', 'agent', true),
  ('${ids.marketing}', 'Test Marketing', 'marketing', true),
  ('${ids.finance}', 'Test Finance', 'finance', true),
  ('${ids.inactive}', 'Test Inactive', 'agent', false);

insert into public.landlords (id, full_name, phone, created_by) values
  ('${ids.landlordA}', 'Landlord A', '+855000100001', '${ids.agentA}'),
  ('${ids.landlordB}', 'Landlord B', '+855000100002', '${ids.agentB}'),
  ('${ids.landlordFree}', 'Landlord Unlinked', '+855000100003', '${ids.manager}');

insert into public.properties
  (id, listing_code, category, property_type, monthly_rent_minor, availability_status,
   publication_status, archived_at, assigned_agent_id, created_by, address, latitude, longitude)
values
  ('${ids.propPublished}', 'RLS-PUB', 'residential', 'apartment', 90000, 'available',
   'published', null, '${ids.agentB}', '${ids.agentB}', '1 Secret Street', 11.55, 104.92),
  ('${ids.propDraftA}', 'RLS-DRAFT-A', 'residential', 'condo', 80000, 'available',
   'draft', null, '${ids.agentA}', '${ids.agentA}', null, null, null),
  ('${ids.propDraftB}', 'RLS-DRAFT-B', 'commercial', 'office', 150000, 'available',
   'draft', null, '${ids.agentB}', '${ids.agentB}', null, null, null),
  ('${ids.propRented}', 'RLS-RENTED', 'residential', 'villa', 200000, 'rented',
   'published', null, '${ids.agentB}', '${ids.agentB}', null, null, null),
  ('${ids.propArchived}', 'RLS-ARCHIVED', 'residential', 'flat', 50000, 'available',
   'archived', now(), '${ids.agentB}', '${ids.agentB}', null, null, null);

insert into public.property_translations (property_id, locale, title) values
  ('${ids.propPublished}', 'en', 'Public title'),
  ('${ids.propDraftB}', 'en', 'Secret draft title');

insert into public.property_media (id, property_id, storage_path) values
  ('${ids.mediaPublished}', '${ids.propPublished}', '${ids.propPublished}/cover.jpg'),
  ('${ids.mediaDraftB}', '${ids.propDraftB}', '${ids.propDraftB}/cover.jpg');

insert into public.property_ownership (property_id, landlord_id, authorization_status) values
  ('${ids.propDraftA}', '${ids.landlordA}', 'pending'),
  ('${ids.propDraftB}', '${ids.landlordB}', 'pending');

insert into public.leads (id, customer_name, email, assigned_agent_id) values
  ('${ids.leadA}', 'Customer A', 'a@customer.invalid', '${ids.agentA}'),
  ('${ids.leadB}', 'Customer B', 'b@customer.invalid', '${ids.agentB}'),
  ('${ids.leadInactive}', 'Customer I', 'i@customer.invalid', '${ids.inactive}');

insert into public.lead_activities (id, lead_id, performed_by, activity_type, notes) values
  ('${ids.activityA}', '${ids.leadA}', '${ids.agentA}', 'note', 'note a'),
  ('${ids.activityB}', '${ids.leadB}', '${ids.agentB}', 'note', 'note b');

insert into public.tasks (id, title, assigned_to, created_by, lead_id) values
  ('${ids.taskA}', 'Task A', '${ids.agentA}', '${ids.manager}', '${ids.leadA}'),
  ('${ids.taskB}', 'Task B', '${ids.agentB}', '${ids.manager}', '${ids.leadB}');

insert into public.rental_deals
  (id, lead_id, property_id, agent_id, landlord_id, agreed_monthly_rent_minor, lease_start, lease_end,
   stage, closing_date, agreement_reference, commission_method, commission_fixed_minor,
   agent_share_method, agent_share_rate)
values
  ('${ids.dealA}', '${ids.leadA}', '${ids.propDraftA}', '${ids.agentA}', '${ids.landlordA}', 80000,
   '2030-01-01', '2030-12-31', 'closed_won', '2030-01-01', 'AGR-A', 'fixed_amount', 40000,
   'percent_of_commission', 50),
  ('${ids.dealB}', '${ids.leadB}', '${ids.propPublished}', '${ids.agentB}', '${ids.landlordB}', 90000,
   '2030-01-01', '2030-12-31', 'closed_won', '2030-01-01', 'AGR-B', 'fixed_amount', 90000,
   'none', null);

insert into public.commissions (id, deal_id, fee_payer, calculation_type, agreed_amount_minor) values
  ('${ids.commissionA}', '${ids.dealA}', 'landlord', 'fixed_amount', 40000),
  ('${ids.commissionB}', '${ids.dealB}', 'landlord', 'fixed_amount', 90000);

insert into storage.objects (bucket_id, name, owner_id) values
  ('property-media', '${ids.propPublished}/cover.jpg', null),
  ('property-media', '${ids.propDraftB}/cover.jpg', null),
  ('private-docs', '${ids.landlordA}/id-card.pdf', null);
`;

export class Session {
  constructor(readonly client: Client) {}

  /** Switch the active database identity for following statements. */
  async as(who: Who): Promise<this> {
    const { client } = this;
    await client.query("reset role");
    if (who === "anon") {
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ role: "anon" }),
      ]);
      await client.query("set local role anon");
    } else {
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: ids[who], role: "authenticated" }),
      ]);
      await client.query("set local role authenticated");
    }
    return this;
  }

  async rows<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return (await this.client.query(sql, [...params])).rows as T[];
  }

  async count(sql: string, params: readonly unknown[] = []): Promise<number> {
    return (await this.client.query(sql, [...params])).rowCount ?? 0;
  }

  /** Runs a statement that must succeed (e.g. an RPC call). */
  async query_ok(sql: string, params: readonly unknown[] = []): Promise<void> {
    await this.client.query(sql, [...params]);
  }

  /** Runs a statement that must fail; returns the Postgres error. */
  async denied(sql: string, params: readonly unknown[] = []): Promise<DatabaseError> {
    await this.client.query("savepoint attempt");
    try {
      await this.client.query(sql, [...params]);
    } catch (error) {
      await this.client.query("rollback to savepoint attempt");
      return error as DatabaseError;
    }
    await this.client.query("release savepoint attempt");
    throw new Error(`Expected this statement to be denied, but it succeeded:\n${sql}`);
  }
}

/** Runs `fn` inside a transaction with fixtures loaded, then rolls back. */
export async function withFixtures(fn: (session: Session) => Promise<void>): Promise<void> {
  const url = getTestDatabaseUrl();
  if (!url) throw new Error("No test database configured");
  assertLocal(url);

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(fixtures);
    await fn(new Session(client));
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
}

/** Postgres error class 42501 covers both "permission denied" and RLS violations. */
export const INSUFFICIENT_PRIVILEGE = "42501";
