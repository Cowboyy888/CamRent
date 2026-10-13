"use client";

import { startTransition, useActionState, type FormEvent } from "react";

/**
 * `useActionState` for forms, without React's automatic form reset.
 *
 * React 19 clears a form's fields after its action runs, including when the
 * server answers with a validation error, which wipes what the person typed.
 * Here the submit event is intercepted and the action is dispatched by hand,
 * so fields keep their values. `action` is still passed to the form, so it
 * keeps working as a normal POST when JavaScript is unavailable.
 */
export function useActionForm<State extends object>(
  action: (previous: Awaited<State>, formData: FormData) => State | Promise<State>,
  initial: Awaited<State>,
) {
  const [state, formAction, pending] = useActionState(action, initial);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return { state, formAction, onSubmit, pending };
}
