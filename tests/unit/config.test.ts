import { describe, expect, it } from "vitest";
import { parseEnv } from "@/config/env";
import { siteConfig } from "@/config/site";

describe("siteConfig", () => {
  it("keeps the two-tone wordmark in sync with the brand name", () => {
    expect(siteConfig.wordmark.join("")).toBe(siteConfig.name);
  });

  it("does not ship placeholder contact details", () => {
    for (const value of Object.values(siteConfig.contact)) {
      expect(value === null || value.trim().length > 0).toBe(true);
    }
  });
});

describe("parseEnv", () => {
  it("applies defaults and treats empty values as unset", () => {
    expect(parseEnv({ NEXT_PUBLIC_SITE_URL: "" })).toEqual({
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NODE_ENV: "development",
    });
  });

  it("fails fast with a readable message", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_SITE_URL: "not a url" })).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});
