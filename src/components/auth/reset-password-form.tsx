"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { Dictionary } from "@/i18n/dictionaries";
import { updatePasswordAction } from "@/server/auth/actions";
import { MIN_PASSWORD_LENGTH, type AuthFormState } from "@/server/auth/form-state";
import { FormError } from "./form-error";

const initial: AuthFormState = {};

export function ResetPasswordForm({ dict }: { dict: Dictionary }) {
  const [state, action, pending] = useActionState(updatePasswordAction, initial);
  const t = dict.auth.reset;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError code={state.error} dict={dict} values={{ min: MIN_PASSWORD_LENGTH }} />
      <Field id="reset-password" label={t.password}>
        <Input
          id="reset-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </Field>
      <Field id="reset-confirm" label={t.confirm}>
        <Input
          id="reset-confirm"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
        {pending ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
