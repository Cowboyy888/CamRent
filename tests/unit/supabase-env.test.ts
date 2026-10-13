import { describe, expect, it } from "vitest";
import { parseSupabasePublicEnv } from "@/config/supabase-env";

const url = "https://abcdefghijkl.supabase.co";
const key = "sb_publishable_0123456789abcdefghij";

describe("parseSupabasePublicEnv", () => {
  it("accepts a URL and a key and trims whitespace", () => {
    expect(parseSupabasePublicEnv({ url: ` ${url} `, key: ` ${key}\n` })).toEqual({
      ok: true,
      value: { url, key },
    });
  });

  it("names both variables when nothing is configured", () => {
    const result = parseSupabasePublicEnv({ url: undefined, key: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join("\n")).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
      expect(result.issues.join("\n")).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    }
  });

  it("rejects a malformed URL or a truncated key", () => {
    expect(parseSupabasePublicEnv({ url: "abcdef", key }).ok).toBe(false);
    expect(parseSupabasePublicEnv({ url, key: "short" }).ok).toBe(false);
    expect(parseSupabasePublicEnv({ url, key: undefined }).ok).toBe(false);
  });
});
