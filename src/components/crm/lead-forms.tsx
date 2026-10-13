"use client";

import { useEffect, useRef } from "react";
import { useActionForm } from "@/components/forms/use-action-form";
import { Textarea } from "@/components/forms/form-parts";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { locales, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { selectableStages, type LeadStage } from "@/lib/crm/stages";
import {
  addLeadNoteAction,
  assignLeadAction,
  changeLeadStageAction,
  scheduleViewingAction,
  updateLeadDetailsAction,
  type CrmFormState,
} from "@/server/crm/actions";
import { propertyCategories } from "@/types/property";

const idle: CrmFormState = { status: "idle" };

function Feedback({ state, dict }: { state: CrmFormState; dict: Dictionary }) {
  const t = dict.crm.lead;
  if (state.status === "error" && state.error) {
    return (
      <p role="alert" className="rounded-control bg-danger-50 p-3 text-sm text-danger">
        {t.errors[state.error]}
      </p>
    );
  }
  if (state.status === "success" && state.message) {
    return (
      <p role="status" className="rounded-control bg-success-50 p-3 text-sm text-success">
        {t.messages[state.message]}
      </p>
    );
  }
  return null;
}

const invalid = (state: CrmFormState, name: string) => state.fields?.includes(name) || undefined;

function Hidden({ id, locale }: { id: string; locale: Locale }) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="locale" value={locale} />
    </>
  );
}

function Submit({ pending, label, dict }: { pending: boolean; label: string; dict: Dictionary }) {
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? dict.crm.lead.buttons.working : label}
    </Button>
  );
}

// ------------------------------------------------------------------ details

export interface LeadFormValues {
  name: string;
  phone: string;
  email: string;
  language: Locale;
  area: string;
  category: string;
  bedrooms: string;
  budgetMin: string;
  budgetMax: string;
  currency: "USD" | "KHR";
  moveIn: string;
  period: string;
  requirements: string;
  followUp: string;
}

export function LeadDetailsForm({
  id,
  locale,
  dict,
  values,
}: {
  id: string;
  locale: Locale;
  dict: Dictionary;
  values: LeadFormValues;
}) {
  const { state, formAction: action, onSubmit, pending } = useActionForm(updateLeadDetailsAction, idle);
  const f = dict.crm.lead.fields;
  const field = (name: string) => `lead-${name}`;
  const bad = (name: string) => invalid(state, name);

  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Hidden id={id} locale={locale} />
      <Feedback state={state} dict={dict} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={field("name")} label={f.name}>
          <Input id={field("name")} name="name" defaultValue={values.name} required maxLength={120} aria-invalid={bad("name")} />
        </Field>
        <Field id={field("language")} label={f.language}>
          <Select id={field("language")} name="language" defaultValue={values.language}>
            {locales.map((code) => (
              <option key={code} value={code}>
                {dict.crm.lead.languages[code]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={field("phone")} label={f.phone}>
          <Input id={field("phone")} name="phone" type="tel" defaultValue={values.phone} maxLength={30} aria-invalid={bad("phone")} />
        </Field>
        <Field id={field("email")} label={f.email}>
          <Input id={field("email")} name="email" type="email" defaultValue={values.email} maxLength={254} aria-invalid={bad("email")} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={field("area")} label={f.area}>
          <Input id={field("area")} name="area" defaultValue={values.area} maxLength={120} />
        </Field>
        <Field id={field("category")} label={f.category}>
          <Select id={field("category")} name="category" defaultValue={values.category}>
            <option value="">{f.anyCategory}</option>
            {propertyCategories.map((c) => (
              <option key={c} value={c}>
                {dict.search[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={field("budgetMin")} label={f.budgetMin}>
          <Input id={field("budgetMin")} name="budgetMin" type="number" inputMode="numeric" min={0} defaultValue={values.budgetMin} aria-invalid={bad("budgetMin")} />
        </Field>
        <Field id={field("budgetMax")} label={f.budgetMax}>
          <Input id={field("budgetMax")} name="budgetMax" type="number" inputMode="numeric" min={0} defaultValue={values.budgetMax} aria-invalid={bad("budgetMax")} />
        </Field>
        <Field id={field("currency")} label={f.currency}>
          <Select id={field("currency")} name="currency" defaultValue={values.currency}>
            <option value="USD">USD</option>
            <option value="KHR">KHR</option>
          </Select>
        </Field>
        <Field id={field("bedrooms")} label={f.bedrooms}>
          <Input id={field("bedrooms")} name="bedrooms" type="number" inputMode="numeric" min={0} max={20} defaultValue={values.bedrooms} />
        </Field>
        <Field id={field("moveIn")} label={f.moveIn}>
          <Input id={field("moveIn")} name="moveIn" type="date" defaultValue={values.moveIn} />
        </Field>
        <Field id={field("period")} label={f.period}>
          <Input id={field("period")} name="period" type="number" inputMode="numeric" min={1} max={120} defaultValue={values.period} />
        </Field>
      </div>

      <Field id={field("requirements")} label={f.requirements}>
        <Textarea id={field("requirements")} name="requirements" defaultValue={values.requirements} maxLength={2000} />
      </Field>

      <Field id={field("followUp")} label={f.followUp} hint={f.followUpHint}>
        <Input
          id={field("followUp")}
          name="followUp"
          type="datetime-local"
          defaultValue={values.followUp}
          aria-invalid={bad("followUp")}
          aria-describedby={`${field("followUp")}-hint`}
        />
      </Field>

      <div>
        <Submit pending={pending} label={dict.crm.lead.buttons.saveDetails} dict={dict} />
      </div>
    </form>
  );
}

// -------------------------------------------------------------------- stage

export function StageForm({
  id,
  locale,
  dict,
  stage,
  reason,
}: {
  id: string;
  locale: Locale;
  dict: Dictionary;
  stage: LeadStage;
  reason: string;
}) {
  const { state, formAction: action, onSubmit, pending } = useActionForm(changeLeadStageAction, idle);
  const formRef = useRef<HTMLFormElement>(null);
  const f = dict.crm.lead.fields;
  const options: LeadStage[] = selectableStages.includes(stage)
    ? [...selectableStages]
    : [stage, ...selectableStages];

  // After a successful change, clear the note and show the new status again.
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Hidden id={id} locale={locale} />
      <Feedback state={state} dict={dict} />
      <Field id="stage-stage" label={f.stage}>
        <Select id="stage-stage" name="stage" defaultValue={stage}>
          {options.map((value) => (
            <option key={value} value={value}>
              {dict.crm.stages[value]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="stage-reason" label={f.reason} hint={f.reasonHint}>
        <Input
          id="stage-reason"
          name="reason"
          defaultValue={reason}
          maxLength={500}
          aria-invalid={invalid(state, "reason")}
          aria-describedby="stage-reason-hint"
        />
      </Field>
      <Field id="stage-note" label={f.stageNote}>
        <Textarea id="stage-note" name="note" maxLength={2000} className="min-h-20" />
      </Field>
      <div>
        <Submit pending={pending} label={dict.crm.lead.buttons.changeStatus} dict={dict} />
      </div>
    </form>
  );
}

// --------------------------------------------------------------- assignment

export function AssignForm({
  id,
  locale,
  dict,
  agents,
  current,
}: {
  id: string;
  locale: Locale;
  dict: Dictionary;
  agents: Array<{ id: string; name: string }>;
  current: string | null;
}) {
  const { state, formAction: action, onSubmit, pending } = useActionForm(assignLeadAction, idle);
  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Hidden id={id} locale={locale} />
      <Feedback state={state} dict={dict} />
      <Field id="assign-agent" label={dict.crm.lead.fields.agent}>
        <Select id="assign-agent" name="agentId" defaultValue={current ?? ""} aria-invalid={invalid(state, "agentId")}>
          <option value="">{dict.crm.common.unassigned}</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-xs text-muted">{dict.crm.lead.assignHint}</p>
      <div>
        <Submit pending={pending} label={dict.crm.lead.buttons.assign} dict={dict} />
      </div>
    </form>
  );
}

// -------------------------------------------------------------------- notes

export function NoteForm({ id, locale, dict }: { id: string; locale: Locale; dict: Dictionary }) {
  const { state, formAction: action, onSubmit, pending } = useActionForm(addLeadNoteAction, idle);
  const f = dict.crm.lead.fields;
  return (
    <form
      // Clear the box after a successful save.
      key={state.status === "success" ? "saved" : "editing"}
      action={action}
      onSubmit={onSubmit}
      className="flex flex-col gap-4"
      noValidate
    >
      <Hidden id={id} locale={locale} />
      <Feedback state={state} dict={dict} />
      <Field id="note-text" label={f.noteLabel}>
        <Textarea
          id="note-text"
          name="note"
          required
          maxLength={2000}
          placeholder={f.notePlaceholder}
          aria-invalid={invalid(state, "note")}
        />
      </Field>
      <div>
        <Submit pending={pending} label={dict.crm.lead.buttons.addNote} dict={dict} />
      </div>
    </form>
  );
}

// ----------------------------------------------------------------- viewings

export function ViewingForm({
  id,
  locale,
  dict,
  hasProperty,
}: {
  id: string;
  locale: Locale;
  dict: Dictionary;
  hasProperty: boolean;
}) {
  const { state, formAction: action, onSubmit, pending } = useActionForm(scheduleViewingAction, idle);
  const formRef = useRef<HTMLFormElement>(null);
  const f = dict.crm.lead.fields;
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Hidden id={id} locale={locale} />
      <Feedback state={state} dict={dict} />
      <Field
        id="viewing-ref"
        label={f.propertyRef}
        hint={hasProperty ? f.propertyRefHint : undefined}
      >
        <Input
          id="viewing-ref"
          name="propertyRef"
          maxLength={60}
          required={!hasProperty}
          aria-invalid={invalid(state, "propertyRef")}
          aria-describedby={hasProperty ? "viewing-ref-hint" : undefined}
        />
      </Field>
      <Field id="viewing-at" label={f.scheduledAt}>
        <Input
          id="viewing-at"
          name="scheduledAt"
          type="datetime-local"
          required
          aria-invalid={invalid(state, "scheduledAt")}
        />
      </Field>
      <div>
        <Submit pending={pending} label={dict.crm.lead.buttons.scheduleViewing} dict={dict} />
      </div>
    </form>
  );
}
