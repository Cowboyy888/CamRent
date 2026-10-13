"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { requestPasswordResetAction } from "@/server/auth/actions";
import type { AuthFormState } from "@/server/auth/form-state";
import { FormError } from "./form-error";

const initial: AuthFormState = {};

export function ForgotPasswordForm({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);
  const t = dict.auth.forgot;
  const loginHref = localizedPath(locale, "/login");

  if (state.done) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">{t.doneTitle}</h2>
        <p className="text-[0.9375rem] text-muted">
          {interpolate(t.doneBody, { email: state.email ?? "" })}
        </p>
        <Link href={loginHref} className="text-sm font-semibold text-mekong-700 hover:underline">
          {t.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError code={state.error} dict={dict} />
      <Field id="forgot-email" label={t.email}>
        <Input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          defaultValue={state.email}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
        {pending ? t.submitting : t.submit}
      </Button>
      <Link href={loginHref} className="text-sm font-semibold text-mekong-700 hover:underline">
        {t.backToLogin}
      </Link>
    </form>
  );
}
