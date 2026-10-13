import Link from "next/link";
import { Field, Input, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/i18n/dictionaries";
import { allStages } from "@/lib/crm/stages";
import { leadSortOptions, type LeadSearchCriteria } from "@/lib/validation/lead-search";
import { propertyTypes } from "@/types/property";
import { selectableStages } from "@/lib/crm/stages";

/** GET form: every filter lands in the URL, so views can be shared and bookmarked. */
export function LeadFilters({
  action,
  criteria,
  dict,
  agents,
  showAgentFilter,
}: {
  action: string;
  criteria: LeadSearchCriteria;
  dict: Dictionary;
  agents: Array<{ id: string; name: string }>;
  showAgentFilter: boolean;
}) {
  const t = dict.crm.leads;
  const f = t.filters;
  const legacy = allStages.filter((s) => !selectableStages.includes(s));

  return (
    <form
      action={action}
      method="get"
      role="search"
      aria-label={t.searchLabel}
      className="rounded-card border border-sand-200 bg-white p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="lf-q" label={t.searchLabel} className="sm:col-span-2">
          <Input
            id="lf-q"
            name="q"
            type="search"
            maxLength={80}
            placeholder={t.searchPlaceholder}
            defaultValue={criteria.q ?? ""}
          />
        </Field>
        <Field id="lf-stage" label={f.stage}>
          <Select id="lf-stage" name="stage" defaultValue={criteria.stage ?? ""}>
            <option value="">{f.anyStage}</option>
            <option value="active">{f.activeStages}</option>
            {[...selectableStages, ...legacy].map((stage) => (
              <option key={stage} value={stage}>
                {dict.crm.stages[stage]}
              </option>
            ))}
          </Select>
        </Field>
        {showAgentFilter ? (
          <Field id="lf-agent" label={f.agent}>
            <Select id="lf-agent" name="agent" defaultValue={criteria.agent ?? ""}>
              <option value="">{f.anyAgent}</option>
              <option value="unassigned">{dict.crm.common.unassigned}</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field id="lf-type" label={f.type}>
          <Select id="lf-type" name="type" defaultValue={criteria.type ?? ""}>
            <option value="">{f.anyType}</option>
            {propertyTypes.map((type) => (
              <option key={type} value={type}>
                {dict.propertyTypes[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="lf-district" label={f.district}>
          <Input id="lf-district" name="district" maxLength={80} defaultValue={criteria.district ?? ""} />
        </Field>
        <Field id="lf-from" label={f.from}>
          <Input id="lf-from" name="from" type="date" defaultValue={criteria.from ?? ""} />
        </Field>
        <Field id="lf-to" label={f.to}>
          <Input id="lf-to" name="to" type="date" defaultValue={criteria.to ?? ""} />
        </Field>
        <Field id="lf-sort" label={f.sort}>
          <Select id="lf-sort" name="sort" defaultValue={criteria.sort}>
            {leadSortOptions.map((option) => (
              <option key={option} value={option}>
                {t.sort[option]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit">
          <Icon name="search" className="size-4" />
          {f.submit}
        </Button>
        <Link href={action} className="text-sm font-semibold text-mekong-700 hover:underline">
          {dict.crm.common.reset}
        </Link>
      </div>
    </form>
  );
}
