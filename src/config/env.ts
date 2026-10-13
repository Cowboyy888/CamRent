import { z } from "zod";

/** Treat empty strings from `.env` files ("KEY=") as "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema);

const envSchema = z.object({
  NEXT_PUBLIC_SITE_URL: optional(z.url().default("http://localhost:3000")),
  NODE_ENV: optional(
    z.enum(["development", "production", "test"]).default("development"),
  ),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables and fails fast with a readable message.
 * Exported separately from `getEnv` so it can be unit-tested with fixtures.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Server-side accessor for validated environment variables. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
