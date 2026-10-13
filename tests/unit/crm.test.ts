import { describe, expect, it } from "vitest";
import { canAssignLeads, canViewDeals, canViewLeads, canWorkLeads } from "@/lib/crm/permissions";
import {
  inactiveStages,
  isActiveStage,
  isLeadStage,
  pipelineStages,
  selectableStages,
  sideStages,
  stageTone,
} from "@/lib/crm/stages";
import {
  parsePhnomPenhDateTime,
  phnomPenhDateStart,
  phnomPenhDayBounds,
  phnomPenhMonthBounds,
  toPhnomPenhInputValue,
} from "@/lib/crm/time";
import { formatDateTime } from "@/lib/format";
import {
  hasLeadFilters,
  parseLeadSearch,
  toLeadQuery,
} from "@/lib/validation/lead-search";
import { sanitizeSearchTerm } from "@/server/crm/queries";

describe("permissions", () => {
  it("lets only admins and managers assign leads", () => {
    expect(canAssignLeads("super_admin")).toBe(true);
    expect(canAssignLeads("manager")).toBe(true);
    for (const role of ["agent", "marketing", "finance"] as const) {
      expect(canAssignLeads(role), role).toBe(false);
    }
  });
  it("keeps leads away from marketing and finance", () => {
    expect(canViewLeads("agent")).toBe(true);
    expect(canViewLeads("marketing")).toBe(false);
    expect(canViewLeads("finance")).toBe(false);
    expect(canWorkLeads("finance")).toBe(false);
  });
  it("shows commission figures to admin, manager and finance only", () => {
    expect(canViewDeals("finance")).toBe(true);
    expect(canViewDeals("agent")).toBe(false);
  });
});

describe("lead stages", () => {
  it("offers the six pipeline stages and the four side statuses", () => {
    expect([...pipelineStages]).toEqual([
      "new",
      "contacted",
      "viewing_scheduled",
      "negotiation",
      "reserved",
      "won",
    ]);
    expect([...sideStages]).toEqual(["lost", "unresponsive", "on_hold", "cancelled"]);
    expect(selectableStages).toHaveLength(10);
  });
  it("treats closed and paused statuses as not active", () => {
    expect([...inactiveStages].sort()).toEqual(["cancelled", "lost", "on_hold", "unresponsive", "won"]);
    expect(isActiveStage("negotiation")).toBe(true);
    expect(isActiveStage("on_hold")).toBe(false);
  });
  it("has a colour for every status and rejects unknown ones", () => {
    for (const stage of selectableStages) expect(stageTone[stage]).toBeDefined();
    expect(isLeadStage("reserved")).toBe(true);
    expect(isLeadStage("archived")).toBe(false);
  });
});

describe("Phnom Penh time", () => {
  it("finds the local day around the UTC date line", () => {
    // 2026-10-12 18:30 UTC is already 13 Oct 01:30 in Phnom Penh.
    const bounds = phnomPenhDayBounds(new Date("2026-10-12T18:30:00Z"));
    expect(bounds).toEqual({ start: "2026-10-12T17:00:00.000Z", end: "2026-10-13T17:00:00.000Z" });
  });
  it("finds the local month", () => {
    const bounds = phnomPenhMonthBounds(new Date("2026-10-31T18:00:00Z")); // 1 Nov local
    expect(bounds.start).toBe("2026-10-31T17:00:00.000Z");
    expect(bounds.end).toBe("2026-11-30T17:00:00.000Z");
  });
  it("converts datetime-local values both ways", () => {
    expect(parsePhnomPenhDateTime("2026-10-13T09:30")).toBe("2026-10-13T02:30:00.000Z");
    expect(toPhnomPenhInputValue("2026-10-13T02:30:00.000Z")).toBe("2026-10-13T09:30");
    expect(toPhnomPenhInputValue(null)).toBe("");
  });
  it("rejects malformed or impossible dates", () => {
    expect(parsePhnomPenhDateTime("2026-02-31T10:00")).toBeNull();
    expect(parsePhnomPenhDateTime("tomorrow")).toBeNull();
    expect(phnomPenhDateStart("2026-13-01")).toBeNull();
    expect(phnomPenhDateStart("2026-10-13")).toBe("2026-10-12T17:00:00.000Z");
  });
  it("formats timestamps in Phnom Penh time with Latin digits", () => {
    expect(formatDateTime("2026-10-13T02:30:00.000Z", "km")).toMatch(/09:30/);
    expect(formatDateTime("2026-10-13T02:30:00.000Z", "en")).toContain("2026");
  });
});

describe("parseLeadSearch", () => {
  it("defaults to newest first, page 1, no filters", () => {
    expect(parseLeadSearch({})).toEqual({ sort: "created_desc", page: 1 });
  });
  it("parses filters and drops invalid values", () => {
    const id = "10000000-0000-0000-0000-000000000003";
    expect(
      parseLeadSearch({
        q: " Dara ",
        stage: "reserved",
        agent: id,
        type: "villa",
        district: "BKK1",
        from: "2026-10-01",
        to: "2026-10-31",
        sort: "followup_asc",
        page: "2",
      }),
    ).toEqual({
      q: "Dara",
      stage: "reserved",
      agent: id,
      type: "villa",
      district: "BKK1",
      from: "2026-10-01",
      to: "2026-10-31",
      sort: "followup_asc",
      page: 2,
    });
    expect(
      parseLeadSearch({ stage: "nope", agent: "x", type: "castle", from: "1/2/2026", sort: "?", page: "0" }),
    ).toEqual({ sort: "created_desc", page: 1 });
  });
  it("accepts the special values active and unassigned", () => {
    expect(parseLeadSearch({ stage: "active", agent: "unassigned" })).toMatchObject({
      stage: "active",
      agent: "unassigned",
    });
  });
  it("swaps a reversed date range and round-trips", () => {
    const c = parseLeadSearch({ from: "2026-10-20", to: "2026-10-01", stage: "new" });
    expect(c.from).toBe("2026-10-01");
    const q = toLeadQuery(c);
    expect(parseLeadSearch(Object.fromEntries(new URLSearchParams(q)))).toEqual(c);
    expect(hasLeadFilters(c)).toBe(true);
    expect(hasLeadFilters(parseLeadSearch({ sort: "name_asc", page: "3" }))).toBe(false);
  });
});

describe("sanitizeSearchTerm", () => {
  it("keeps emails and phone numbers but removes filter syntax", () => {
    expect(sanitizeSearchTerm("dara@example.com")).toBe("dara@example.com");
    expect(sanitizeSearchTerm("+855 12-345")).toBe("+855 12-345");
    expect(sanitizeSearchTerm("a),stage.eq.won,(b%_*")).toBe("a stage.eq.won b");
  });
});
