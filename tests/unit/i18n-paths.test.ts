import { describe, expect, it } from "vitest";
import { isLocale, locales } from "@/i18n/config";
import { localizedPath, stripLocale, switchLocalePath } from "@/i18n/paths";

describe("locale config", () => {
  it("supports exactly English, Khmer and Simplified Chinese", () => {
    expect([...locales]).toEqual(["en", "km", "zh"]);
  });

  it("recognises only supported locale segments", () => {
    expect(isLocale("km")).toBe(true);
    expect(isLocale("zh-Hans")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("localizedPath", () => {
  it("prefixes paths with the locale", () => {
    expect(localizedPath("km")).toBe("/km");
    expect(localizedPath("km", "/")).toBe("/km");
    expect(localizedPath("zh", "/rent/commercial")).toBe("/zh/rent/commercial");
    expect(localizedPath("en", "about")).toBe("/en/about");
  });
});

describe("stripLocale", () => {
  it("removes a leading locale segment only", () => {
    expect(stripLocale("/zh/rent/commercial")).toBe("/rent/commercial");
    expect(stripLocale("/km")).toBe("/");
    expect(stripLocale("/admin")).toBe("/admin");
    expect(stripLocale("/kmer/about")).toBe("/kmer/about");
  });
});

describe("switchLocalePath", () => {
  it("keeps the same page when switching language", () => {
    expect(switchLocalePath("/en/landlords", "km")).toBe("/km/landlords");
    expect(switchLocalePath("/km", "zh")).toBe("/zh");
  });

  it("keeps the query string (search filters)", () => {
    expect(switchLocalePath("/en/search", "zh", "category=commercial&type=office")).toBe(
      "/zh/search?category=commercial&type=office",
    );
    expect(switchLocalePath("/en/search", "km", "?beds=2")).toBe("/km/search?beds=2");
  });
});
