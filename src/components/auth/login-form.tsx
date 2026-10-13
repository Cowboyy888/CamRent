"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { signInAction } from "@/server/auth/actions";
import type { AuthFormState } from "@/server/auth/form-state";
import { FormError } from "./form-error";

const initial: AuthFormState = {};

export function LoginForm({
  locale,
  dict,
  next,
}: {
  locale: Locale;
  dict: Dictionary;
  next: string;
}) {
  const [state, action, pending] = useActionState(signInAction, initial);
  const t = dict.auth.login;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next} />

      <FormError code={state.error} dict={dict} />

      <Field id="login-email" label={t.email}>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          defaultValue={state.email}
          aria-invalid={state.error === "invalidInput" || undefined}
        />
      </Field>
      <Field id="login-password" label={t.password}>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
        {pending ? t.submitting : t.submit}
      </Button>

      <Link
        href={localizedPath(locale, "/forgot-password")}
        className="text-sm font-semibold text-mekong-700 hover:underline"
      >
        {t.forgot}
      </Link>
    </form>
  );
}
