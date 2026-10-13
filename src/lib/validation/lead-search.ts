import { z } from "zod";
import { allStages, type LeadStage } from "@/lib/crm/stages";
import { propertyTypes, type PropertyType } from "@/types/property";

export const LEADS_PAGE_SIZE = 20;
export const leadSortOptions = [
  "created_desc",
  "created_asc",
  "updated_desc",
  "followup_asc",
  "name_asc",
] as const;
export type LeadSort = (typeof leadSortOptions)[number];

const blank = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blank, schema.optional()).catch(undefined);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const schema = z.object({
  q: optional(z.string().trim().max(80)),
  stage: optional(z.enum(["active", ...allStages] as [string, ...string[]])),
  agent: optional(z.union([z.literal("unassigned"), z.guid()])),
  type: optional(z.enum(propertyTypes)),
  district: optional(z.string().trim().max(80)),
  from: optional(isoDate),
  to: optional(isoDate),
  sort: z.enum(leadSortOptions).catch("created_desc"),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

export interface LeadSearchCriteria {
  q?: string;
  /** A lead stage, or "active" for every stage still in play. */
  stage?: LeadStage | "active";
  /** An agent's profile id or "unassigned". */
  agent?: string;
  type?: PropertyType;
  district?: string;
  /** YYYY-MM-DD, Phnom Penh time. */
  from?: string;
  to?: string;
  sort: LeadSort;
  page: number;
}

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseLeadSearch(raw: Raw): LeadSearchCriteria {
  const parsed = schema.parse({
    q: first(raw.q),
    stage: first(raw.stage),
    agent: first(raw.agent),
    type: first(raw.type),
    district: first(raw.district),
    from: first(raw.from),
    to: first(raw.to),
    sort: first(raw.sort),
    page: first(raw.page),
  });
  const criteria: LeadSearchCriteria = { sort: parsed.sort, page: parsed.page };
  if (parsed.q) criteria.q = parsed.q;
  if (parsed.stage) criteria.stage = parsed.stage as LeadStage | "active";
  if (parsed.agent) criteria.agent = parsed.agent;
  if (parsed.type) criteria.type = parsed.type;
  if (parsed.district) criteria.district = parsed.district;
  if (parsed.from) criteria.from = parsed.from;
  if (parsed.to) criteria.to = parsed.to;
  if (criteria.from && criteria.to && criteria.from > criteria.to) {
    [criteria.from, criteria.to] = [criteria.to, criteria.from];
  }
  return criteria;
}

export function toLeadQuery(
  criteria: LeadSearchCriteria,
  overrides: Partial<Pick<LeadSearchCriteria, "page">> = {},
): string {
  const c = { ...criteria, ...overrides };
  const params = new URLSearchParams();
  if (c.q) params.set("q", c.q);
  if (c.stage) params.set("stage", c.stage);
  if (c.agent) params.set("agent", c.agent);
  if (c.type) params.set("type", c.type);
  if (c.district) params.set("district", c.district);
  if (c.from) params.set("from", c.from);
  if (c.to) params.set("to", c.to);
  if (c.sort !== "created_desc") params.set("sort", c.sort);
  if (c.page > 1) params.set("page", String(c.page));
  return params.toString();
}

export function hasLeadFilters(c: LeadSearchCriteria): boolean {
  return Boolean(c.q || c.stage || c.agent || c.type || c.district || c.from || c.to);
}
