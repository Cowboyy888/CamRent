import { describe, expect, it } from "vitest";
import {
  isLikelyBot,
  matchLanguageTag,
  parseAcceptLanguage,
  resolvePreferredLocale,
} from "@/i18n/negotiate";

describe("parseAcceptLanguage", () => {
  it("orders tags by quality, keeping header order for ties", () => {
    expect(parseAcceptLanguage("en;q=0.5,km-KH,zh;q=0.8,km;q=0.9")).toEqual([
      "km-KH",
      "km",
      "zh",
      "en",
    ]);
  });

  it("ignores wildcards, empty parts and q=0", () => {
    expect(parseAcceptLanguage("*, ,fr;q=0,en")).toEqual(["en"]);
  });

  it("returns an empty list for a missing header", () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage("")).toEqual([]);
  });
});

describe("matchLanguageTag", () => {
  it.each([
    ["en-US", "en"],
    ["km-KH", "km"],
    ["KM", "km"],
    ["zh-CN", "zh"],
    ["zh-Hans-SG", "zh"],
    ["zh-TW", "zh"],
    ["fr-FR", null],
  ])("%s -> %s", (tag, expected) => {
    expect(matchLanguageTag(tag)).toBe(expected);
  });
});

describe("resolvePreferredLocale", () => {
  it("defaults to English", () => {
    expect(resolvePreferredLocale({})).toBe("en");
  });

  it("uses the first supported browser language", () => {
    expect(resolvePreferredLocale({ acceptLanguage: "fr-FR,km;q=0.8,en;q=0.5" })).toBe("km");
  });

  it("prefers the saved cookie over the browser language", () => {
    expect(resolvePreferredLocale({ cookieLocale: "zh", acceptLanguage: "km" })).toBe("zh");
  });

  it("ignores an invalid cookie value", () => {
    expect(resolvePreferredLocale({ cookieLocale: "fr", acceptLanguage: "zh-CN" })).toBe("zh");
  });

  it("always sends crawlers to the default locale", () => {
    const googlebot = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
    expect(isLikelyBot(googlebot)).toBe(true);
    expect(resolvePreferredLocale({ userAgent: googlebot, acceptLanguage: "km" })).toBe("en");
  });
});
