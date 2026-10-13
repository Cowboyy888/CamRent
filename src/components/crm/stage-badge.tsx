import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/i18n/dictionaries";
import { stageTone, type LeadStage } from "@/lib/crm/stages";

export function StageBadge({ stage, dict }: { stage: LeadStage; dict: Dictionary }) {
  return <Badge tone={stageTone[stage]}>{dict.crm.stages[stage]}</Badge>;
}
