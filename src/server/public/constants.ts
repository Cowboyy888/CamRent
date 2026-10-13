export const submitterRelationships = [
  "owner",
  "authorized_representative",
  "developer",
  "other_agent",
  "other",
] as const;

/** Most requests one phone number or email may send per hour. */
export const MAX_REQUESTS_PER_HOUR = 5;

/** Result of a public form submission. Codes map to dictionary messages. */
export type PublicFormErrorCode =
  | "invalid"
  | "contactRequired"
  | "consentRequired"
  | "rateLimited"
  | "notConfigured"
  | "propertyUnavailable"
  | "unexpected";

export interface PublicFormState {
  status: "idle" | "success" | "error";
  error?: PublicFormErrorCode;
  /** Names of invalid fields, so the form can mark them. */
  fields?: string[];
}
