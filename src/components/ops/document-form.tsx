"use client";

import Link from "next/link";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { locales, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { dashboardPath } from "@/server/auth/constants";
import { generateDocumentAction, type DocumentFormState } from "@/server/documents/actions";

const idle: DocumentFormState = { status: "idle" };

export function DocumentForm({
  type,
  options,
  locale,
  defaultEntity,
  englishOnly,
  dict,
}: {
  type: string;
  options: Array<{ id: string; label: string }>;
  locale: Locale;
  defaultEntity: string;
  englishOnly: boolean;
  dict: Dictionary;
}) {
  const { state, formAction, onSubmit, pending } = useActionForm(generateDocumentAction, idle);
  const t = dict.ops.documents;

  return (
    <form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="uiLocale" value={locale} />

      {state.status === "error" && state.error ? (
        <p role="alert" className="rounded-control bg-danger-50 p-3 text-sm text-danger">
          {t.errors[state.error]}
        </p>
      ) : null}
      {state.status === "success" && state.id ? (
        <p role="status" className="rounded-control bg-success-50 p-3 text-sm text-success">
          {t.created} {state.reference}{" "}
          <Link
            href={dashboardPath(locale, `/documents/${state.id}/download`)}
            prefetch={false}
            className="font-semibold underline"
          >
            {t.download}
          </Link>
        </p>
      ) : null}

      <Field id="doc-entity" label={t.entityLabel}>
        <Select id="doc-entity" name="entityId" defaultValue={defaultEntity} required>
          <option value="">{t.chooseRecord}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="doc-locale" label={t.languageLabel} hint={englishOnly ? t.englishOnly : t.languageNote}>
        <Select
          id="doc-locale"
          name={englishOnly ? undefined : "locale"}
          defaultValue={englishOnly ? "en" : locale}
          disabled={englishOnly}
          aria-describedby="doc-locale-hint"
        >
          {locales.map((code) => (
            <option key={code} value={code}>
              {t.languages[code]}
            </option>
          ))}
        </Select>
      </Field>
      {englishOnly ? <input type="hidden" name="locale" value="en" /> : null}
      <div>
        <Button type="submit" disabled={pending || options.length === 0} aria-busy={pending}>
          {pending ? t.generating : t.generate}
        </Button>
      </div>
    </form>
  );
}
