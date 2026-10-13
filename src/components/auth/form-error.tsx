import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/dictionaries";
import type { AuthErrorCode } from "@/server/auth/form-state";

/** Announced to screen readers when it appears (role="alert"). */
export function FormError({
  code,
  dict,
  values = {},
}: {
  code: AuthErrorCode | undefined;
  dict: Dictionary;
  values?: Record<string, string | number>;
}) {
  if (!code) return null;
  return (
    <p role="alert" className="rounded-control bg-danger-50 p-3 text-sm text-danger">
      {interpolate(dict.auth.errors[code], values)}
    </p>
  );
}
