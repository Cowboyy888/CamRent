"use client";

import { useActionForm } from "./use-action-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { submitEnquiryAction } from "@/server/public/actions";
import type { PublicFormState } from "@/server/public/constants";
import {
  ConsentCheckbox,
  FormMessage,
  Honeypot,
  SuccessMessage,
  Textarea,
} from "./form-parts";

const initial: PublicFormState = { status: "idle" };

/** Enquiry about one property, or a general message when propertyId is absent. */
export function EnquiryForm({
  locale,
  dict,
  propertyId,
  idPrefix = "enquiry",
}: {
  locale: Locale;
  dict: Dictionary;
  propertyId?: string;
  idPrefix?: string;
}) {
  const { state, formAction: action, onSubmit, pending } = useActionForm(submitEnquiryAction, initial);
  const t = dict.enquiry;
  const id = (name: string) => `${idPrefix}-${name}`;
  const invalid = (name: string) => state.fields?.includes(name) || undefined;

  if (state.status === "success") {
    return <SuccessMessage title={t.successTitle} body={t.successBody} />;
  }

  return (
    <form action={action} onSubmit={onSubmit} className="relative flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {propertyId ? <input type="hidden" name="propertyId" value={propertyId} /> : null}
      <Honeypot />

      {state.status === "error" && state.error ? (
        <FormMessage>{t.errors[state.error]}</FormMessage>
      ) : null}

      <Field id={id("name")} label={t.name}>
        <Input
          id={id("name")}
          name="name"
          autoComplete="name"
          required
          maxLength={120}
          aria-invalid={invalid("name")}
        />
      </Field>
      <Field id={id("phone")} label={t.phone} hint={t.contactHint}>
        <Input
          id={id("phone")}
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          maxLength={30}
          aria-invalid={invalid("phone")}
          aria-describedby={`${id("phone")}-hint`}
        />
      </Field>
      <Field id={id("email")} label={t.email}>
        <Input
          id={id("email")}
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          aria-invalid={invalid("email")}
        />
      </Field>
      <Field id={id("message")} label={t.message}>
        <Textarea id={id("message")} name="message" maxLength={1000} aria-invalid={invalid("message")} />
      </Field>
      <ConsentCheckbox id={id("consent")} invalid={Boolean(invalid("consent"))}>
        {t.consent}
      </ConsentCheckbox>

      <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
        {pending ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
