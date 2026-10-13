import { describe, expect, it } from "vitest";
import { locales } from "@/i18n/config";
import { interpolate, loadDictionary } from "@/i18n/dictionaries";

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [[path, value] as [string, string]] : leaves(value, path);
  });
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("dictionaries", async () => {
  const english = leaves((await loadDictionary("en")) as unknown as Tree);
  const englishKeys = english.map(([key]) => key);

  it.each(locales)("%s has exactly the English keys", async (locale) => {
    const keys = leaves((await loadDictionary(locale)) as unknown as Tree).map(([key]) => key);
    expect(keys).toEqual(englishKeys);
  });

  it.each(locales)("%s has no empty strings", async (locale) => {
    const empty = leaves((await loadDictionary(locale)) as unknown as Tree).filter(
      ([, value]) => value.trim() === "",
    );
    expect(empty).toEqual([]);
  });

  it.each(locales)("%s uses the same {placeholders} as English", async (locale) => {
    const translated = new Map(leaves((await loadDictionary(locale)) as unknown as Tree));
    for (const [key, value] of english) {
      expect(placeholders(translated.get(key) ?? ""), key).toEqual(placeholders(value));
    }
  });
});

describe("interpolate", () => {
  it("replaces known placeholders and leaves unknown ones visible", () => {
    expect(interpolate("{brand} in {city}", { brand: "CamRent", city: "Phnom Penh" })).toBe(
      "CamRent in Phnom Penh",
    );
    expect(interpolate("Hello {name}", {})).toBe("Hello {name}");
    expect(interpolate("{count} bd", { count: 2 })).toBe("2 bd");
  });
});
