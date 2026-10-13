"use client";

import { useState } from "react";
import { useActionForm } from "./use-action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { locales, localeMeta, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { submitLandlordListingAction } from "@/server/public/actions";
import { submitterRelationships, type PublicFormState } from "@/server/public/constants";
import {
  commercialTypes,
  propertyCategories,
  residentialTypes,
  type PropertyCategory,
} from "@/types/property";
import {
  ConsentCheckbox,
  FormMessage,
  Honeypot,
  SuccessMessage,
  Textarea,
} from "./form-parts";

const initial: PublicFormState = { status: "idle" };

export function LandlordForm({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { state, formAction: action, onSubmit, pending } = useActionForm(submitLandlordListingAction, initial);
  const [category, setCategory] = useState<PropertyCategory>("residential");
  const t = dict.listProperty;
  const invalid = (name: string) => state.fields?.includes(name) || undefined;

  if (state.status === "success") {
    return <SuccessMessage title={t.successTitle} body={t.successBody} />;
  }

  const types = category === "residential" ? residentialTypes : commercialTypes;

  return (
    <form action={action} onSubmit={onSubmit} className="relative flex flex-col gap-5" noValidate>
      <Honeypot />
      {state.status === "error" && state.error ? (
        <FormMessage>
          {t.errors[state.error === "propertyUnavailable" ? "unexpected" : state.error]}
        </FormMessage>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="lp-name" label={t.yourName}>
          <Input id="lp-name" name="name" autoComplete="name" required maxLength={120} aria-invalid={invalid("name")} />
        </Field>
        <Field id="lp-relationship" label={t.relationship}>
          <Select id="lp-relationship" name="relationship" defaultValue="owner" required>
            {submitterRelationships.map((value) => (
              <option key={value} value={value}>
                {t.relationshipOptions[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="lp-phone" label={t.phone}>
          <Input id="lp-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} aria-invalid={invalid("phone")} />
        </Field>
        <Field id="lp-email" label={t.email}>
          <Input id="lp-email" name="email" type="email" autoComplete="email" maxLength={254} aria-invalid={invalid("email")} />
        </Field>
        <Field id="lp-language" label={t.language}>
          <Select id="lp-language" name="language" defaultValue={locale}>
            {locales.map((code) => (
              <option key={code} value={code}>
                {localeMeta[code].nativeName}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-base font-bold">{t.formTitle}</legend>
        <Field id="lp-category" label={t.category}>
          <Select
            id="lp-category"
            name="category"
            value={category}
            onChange={(event) => setCategory(event.target.value as PropertyCategory)}
          >
            {propertyCategories.map((value) => (
              <option key={value} value={value}>
                {dict.search[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="lp-type" label={t.type}>
          <Select id="lp-type" name="type" key={category} defaultValue="" aria-invalid={invalid("type")}>
            <option value="">{t.selectType}</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {dict.propertyTypes[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="lp-district" label={t.district}>
          <Input id="lp-district" name="district" maxLength={120} />
        </Field>
        <Field id="lp-neighborhood" label={t.neighborhood}>
          <Input id="lp-neighborhood" name="neighborhood" maxLength={120} />
        </Field>
        <Field id="lp-address" label={t.address} hint={t.addressHint} className="sm:col-span-2">
          <Input id="lp-address" name="address" maxLength={300} aria-describedby="lp-address-hint" />
        </Field>
        {category === "residential" ? (
          <Field id="lp-bedrooms" label={t.bedrooms}>
            <Input id="lp-bedrooms" name="bedrooms" type="number" inputMode="numeric" min={0} max={50} />
          </Field>
        ) : null}
        <Field id="lp-rent" label={t.expectedRent} hint={t.expectedRentHint}>
          <Input id="lp-rent" name="expectedRent" type="number" inputMode="numeric" min={0} max={1000000} step={10} aria-describedby="lp-rent-hint" />
        </Field>
        <Field id="lp-description" label={t.description} hint={t.descriptionHint} className="sm:col-span-2">
          <Textarea id="lp-description" name="description" maxLength={2000} aria-describedby="lp-description-hint" />
        </Field>
      </fieldset>

      <ConsentCheckbox id="lp-consent" invalid={Boolean(invalid("consent"))}>
        {t.consent}
      </ConsentCheckbox>
      <p className="text-xs text-muted">{t.privacyNote}</p>

      <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
        {pending ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
