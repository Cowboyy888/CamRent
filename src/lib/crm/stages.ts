import type { Database } from "@/types/database";

export type LeadStage = Database["public"]["Enums"]["lead_stage"];

/** The sales pipeline, in order. */
export const pipelineStages = [
  "new",
  "contacted",
  "viewing_scheduled",
  "negotiation",
  "reserved",
  "won",
] as const satisfies readonly LeadStage[];

/** Statuses that take a lead out of the active pipeline. */
export const sideStages = [
  "lost",
  "unresponsive",
  "on_hold",
  "cancelled",
] as const satisfies readonly LeadStage[];

/** What staff can choose. `qualified` and `viewed` are legacy values, shown but not offered. */
export const selectableStages: readonly LeadStage[] = [...pipelineStages, ...sideStages];

/** Statuses that need an explanation. */
export const stagesWithReason: readonly LeadStage[] = ["lost", "unresponsive", "on_hold", "cancelled"];

/** Closed or paused: not counted as "active". Mirrors the SQL in migration 0008. */
export const inactiveStages: readonly LeadStage[] = ["won", "lost", "cancelled", "unresponsive", "on_hold"];

export const allStages: readonly LeadStage[] = [
  "new",
  "contacted",
  "qualified",
  "viewing_scheduled",
  "viewed",
  "negotiation",
  "reserved",
  "won",
  "lost",
  "unresponsive",
  "on_hold",
  "cancelled",
];

export function isLeadStage(value: unknown): value is LeadStage {
  return typeof value === "string" && (allStages as readonly string[]).includes(value);
}

export function isActiveStage(stage: LeadStage): boolean {
  return !inactiveStages.includes(stage);
}

export type StageTone = "info" | "brand" | "success" | "warning" | "danger" | "neutral";

export const stageTone: Record<LeadStage, StageTone> = {
  new: "info",
  contacted: "brand",
  qualified: "brand",
  viewing_scheduled: "brand",
  viewed: "brand",
  negotiation: "warning",
  reserved: "warning",
  won: "success",
  lost: "danger",
  unresponsive: "neutral",
  on_hold: "neutral",
  cancelled: "neutral",
};
