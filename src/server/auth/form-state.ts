/**
 * Shared by the auth Server Actions and the client forms. Kept outside the
 * "use server" file because such files may export only async functions.
 *
 * Error codes are returned instead of text so every language shows its own
 * message from the dictionary (`auth.errors`).
 */
export type AuthErrorCode =
  | "invalidInput"
  | "invalidCredentials"
  | "noAccess"
  | "notConfigured"
  | "rateLimited"
  | "sessionExpired"
  | "passwordTooShort"
  | "passwordMismatch"
  | "unexpected";

export interface AuthFormState {
  error?: AuthErrorCode;
  /** Set after a successful request that does not redirect (forgot password). */
  done?: boolean;
  email?: string;
}

/** Keep in step with minimum_password_length in supabase/config.toml. */
export const MIN_PASSWORD_LENGTH = 12;
