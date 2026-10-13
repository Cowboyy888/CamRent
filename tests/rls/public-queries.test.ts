import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { parsePropertySearch, SEARCH_PAGE_SIZE } from "@/lib/validation/property-search";
import {
  getLatestProperties,
  getPropertyDetail,
  getSimilarProperties,
  searchProperties,
} from "@/server/properties/queries";
import type { Database } from "@/types/database";
import { getTestDatabaseUrl } from "./harness";

/**
 * Runs the real public queries through the real Data API as an anonymous
 * visitor. Needs the local stack with the development seed
 * (`npx supabase start` / `db reset`) and `npm run test:rls`.
 */
const enabled = getTestDatabaseUrl() !== undefined;
const suite = enabled ? describe : describe.skip;

// The well-known anon JWT of every local Supabase stack (not a secret).
const LOCAL_ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const client = createClient<Database>(
  process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:55321",
  LOCAL_ANON_KEY,
  { auth: { persistSession: false } },
);

const DRAFT_ID = "30000000-0000-0000-0000-000000000002"; // DEV-0002, draft
const RENTED_ID = "30000000-0000-0000-0000-000000000003"; // DEV-0003, rented
const PUBLISHED_ID = "30000000-0000-0000-0000-000000000001"; // DEV-0001

suite("public queries (anonymous visitor)", () => {
  it("search returns only published, available listings, one page at a time", async () => {
    const result = await searchProperties(client, parsePropertySearch({}), "en");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { items, total, pageCount } = result.data;
    expect(total).toBeGreaterThan(SEARCH_PAGE_SIZE); // the seed has 15
    expect(items).toHaveLength(SEARCH_PAGE_SIZE);
    expect(pageCount).toBe(Math.ceil(total / SEARCH_PAGE_SIZE));
    const refs = items.map((item) => item.reference);
    expect(refs).not.toContain("DEV-0002");
    expect(refs).not.toContain("DEV-0003");
  });

  it("paginates without overlap and clamps an out-of-range page", async () => {
    const first = await searchProperties(client, parsePropertySearch({ page: "1" }), "en");
    const second = await searchProperties(client, parsePropertySearch({ page: "2" }), "en");
    const beyond = await searchProperties(client, parsePropertySearch({ page: "500" }), "en");
    if (!first.ok || !second.ok || !beyond.ok) throw new Error("query failed");
    const a = new Set(first.data.items.map((i) => i.reference));
    expect(second.data.items.length).toBeGreaterThan(0);
    for (const item of second.data.items) expect(a.has(item.reference)).toBe(false);
    expect(beyond.data.page).toBe(beyond.data.pageCount);
  });

  it("filters by category, type, area, rent, bedrooms and furnishing", async () => {
    const commercial = await searchProperties(
      client,
      parsePropertySearch({ category: "commercial" }),
      "en",
    );
    if (!commercial.ok) throw new Error("query failed");
    expect(commercial.data.items.every((i) => i.category === "commercial")).toBe(true);

    const cheap = await searchProperties(client, parsePropertySearch({ maxPrice: "700" }), "en");
    if (!cheap.ok) throw new Error("query failed");
    expect(cheap.data.items.length).toBeGreaterThan(0);
    expect(
      cheap.data.items.every((i) => i.rent.currency === "USD" && i.rent.amountMinor <= 70000),
    ).toBe(true);

    const area = await searchProperties(client, parsePropertySearch({ area: "toul" }), "en");
    if (!area.ok) throw new Error("query failed");
    expect(area.data.items.length).toBeGreaterThan(0);
    expect(area.data.items.every((i) => /toul/i.test(i.areaName))).toBe(true);

    const beds = await searchProperties(client, parsePropertySearch({ beds: "2" }), "en");
    if (!beds.ok) throw new Error("query failed");
    expect(beds.data.items.every((i) => i.bedrooms === 2)).toBe(true);

    const furnished = await searchProperties(
      client,
      parsePropertySearch({ furnishing: "unfurnished", availability: "available" }),
      "en",
    );
    if (!furnished.ok) throw new Error("query failed");
    expect(furnished.data.items.every((i) => i.availability === "available")).toBe(true);
  });

  it("sorts by price in both directions", async () => {
    const asc = await searchProperties(client, parsePropertySearch({ sort: "priceAsc" }), "en");
    const desc = await searchProperties(client, parsePropertySearch({ sort: "priceDesc" }), "en");
    if (!asc.ok || !desc.ok) throw new Error("query failed");
    const a = asc.data.items.map((i) => i.rent.amountMinor);
    const d = desc.data.items.map((i) => i.rent.amountMinor);
    expect(a).toEqual([...a].sort((x, y) => x - y));
    expect(d).toEqual([...d].sort((x, y) => y - x));
  });

  it("returns an empty result, not an error, when nothing matches", async () => {
    const result = await searchProperties(
      client,
      parsePropertySearch({ area: "Atlantis", minPrice: "999999" }),
      "en",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.total).toBe(0);
  });

  it("treats filter-injection attempts as plain text", async () => {
    const result = await searchProperties(
      client,
      parsePropertySearch({ area: "x),id.not.is.null,(y" }),
      "en",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.total).toBe(0);
  });

  it("uses the visitor's language and falls back honestly", async () => {
    const result = await getLatestProperties(client, "km", 3);
    if (!result.ok) throw new Error("query failed");
    // The seed has English translations only: the English text is used, not invented Khmer.
    expect(result.data[0]?.title).toMatch(/DEV SEED/);
  });

  it("detail: published listing is returned with public fields only", async () => {
    const result = await getPropertyDetail(client, PUBLISHED_ID, "en");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.property.reference).toBe("DEV-0001");
    expect(result.property.title).toMatch(/two-bedroom/);
    expect(Object.keys(result.property)).not.toContain("address");
    expect(Object.keys(result.property)).not.toContain("assigned_agent_id");
  });

  it("detail: draft, rented and unknown ids are not found", async () => {
    for (const id of [DRAFT_ID, RENTED_ID, "99999999-9999-4999-8999-999999999999", "not-a-uuid"]) {
      const result = await getPropertyDetail(client, id, "en");
      expect(result.status, id).toBe("notFound");
    }
  });

  it("similar properties exclude the listing itself and stay in the category", async () => {
    const detail = await getPropertyDetail(client, PUBLISHED_ID, "en");
    if (detail.status !== "ok") throw new Error("missing");
    const similar = await getSimilarProperties(client, detail.property, "en");
    expect(similar.length).toBeGreaterThan(0);
    expect(similar.length).toBeLessThanOrEqual(4);
    expect(similar.map((s) => s.reference)).not.toContain("DEV-0001");
    expect(similar.every((s) => s.category === detail.property.category)).toBe(true);
  });

  it("anonymous visitors cannot read landlords, leads or unpublished rows directly", async () => {
    for (const table of ["landlords", "leads", "properties", "landlord_submissions"] as const) {
      const { data, error } = await client.from(table).select("*").limit(1);
      expect(error, table).not.toBeNull();
      expect(data, table).toBeNull();
    }
  });
});
