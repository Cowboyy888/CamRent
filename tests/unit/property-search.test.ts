import { describe, expect, it } from "vitest";
import {
  hasActiveFilters,
  parsePropertySearch,
  toSearchQuery,
} from "@/lib/validation/property-search";

const defaults = { sort: "newest", page: 1 } as const;

describe("parsePropertySearch", () => {
  it("searches everything, newest first, page 1 when no filters are given", () => {
    expect(parsePropertySearch({})).toEqual(defaults);
  });

  it("parses a full search", () => {
    expect(
      parsePropertySearch({
        category: "residential",
        type: "condo",
        area: "  BKK1 ",
        minPrice: "800",
        maxPrice: "1500",
        beds: "2",
        baths: "2",
        furnishing: "fully_furnished",
        availability: "available",
        sort: "priceAsc",
        page: "3",
      }),
    ).toEqual({
      category: "residential",
      type: "condo",
      area: "BKK1",
      minPrice: 800,
      maxPrice: 1500,
      beds: "2",
      baths: "2",
      furnishing: "fully_furnished",
      availability: "available",
      sort: "priceAsc",
      page: 3,
    });
  });

  it("drops invalid values instead of failing", () => {
    expect(
      parsePropertySearch({
        category: "castle",
        type: "spaceship",
        minPrice: "-5",
        maxPrice: "abc",
        beds: "9",
        baths: "0",
        furnishing: "lavish",
        availability: "rented",
        sort: "random",
        page: "-2",
      }),
    ).toEqual(defaults);
  });

  it("falls back to page 1 for non-numeric, zero or absurd pages", () => {
    for (const page of ["abc", "0", "1.5", "99999999"]) {
      expect(parsePropertySearch({ page }).page, page).toBe(1);
    }
  });

  it("drops a property type that does not belong to the category", () => {
    expect(parsePropertySearch({ category: "commercial", type: "villa" })).toEqual({
      ...defaults,
      category: "commercial",
    });
  });

  it("keeps a type without a category", () => {
    expect(parsePropertySearch({ type: "villa" })).toEqual({ ...defaults, type: "villa" });
  });

  it("ignores bedrooms for commercial searches", () => {
    expect(parsePropertySearch({ category: "commercial", beds: "2" })).toEqual({
      ...defaults,
      category: "commercial",
    });
  });

  it("swaps a reversed price range", () => {
    expect(parsePropertySearch({ minPrice: "2000", maxPrice: "500" })).toMatchObject({
      minPrice: 500,
      maxPrice: 2000,
    });
  });

  it("treats empty form fields as not set and uses the first repeated value", () => {
    expect(
      parsePropertySearch({
        area: "",
        minPrice: "",
        type: ["office", "villa"],
        category: "commercial",
        sort: "",
      }),
    ).toEqual({ ...defaults, category: "commercial", type: "office" });
  });

  it("rejects overly long area text", () => {
    expect(parsePropertySearch({ area: "x".repeat(81) })).toEqual(defaults);
  });
});

describe("toSearchQuery", () => {
  it("round-trips through the parser and omits defaults", () => {
    const criteria = parsePropertySearch({
      category: "commercial",
      type: "warehouse",
      area: "Chbar Ampov",
      maxPrice: "3000",
      sort: "priceDesc",
      page: "2",
    });
    const query = toSearchQuery(criteria);
    expect(query).toBe(
      "category=commercial&type=warehouse&area=Chbar+Ampov&maxPrice=3000&sort=priceDesc&page=2",
    );
    expect(parsePropertySearch(Object.fromEntries(new URLSearchParams(query)))).toEqual(criteria);
  });

  it("produces an empty query for the default search", () => {
    expect(toSearchQuery(parsePropertySearch({}))).toBe("");
  });

  it("can override the page for pagination links", () => {
    const criteria = parsePropertySearch({ category: "residential", page: "2" });
    expect(toSearchQuery(criteria, { page: 3 })).toBe("category=residential&page=3");
    expect(toSearchQuery(criteria, { page: 1 })).toBe("category=residential");
  });
});

describe("hasActiveFilters", () => {
  it("ignores sort and page", () => {
    expect(hasActiveFilters(parsePropertySearch({ sort: "priceAsc", page: "4" }))).toBe(false);
    expect(hasActiveFilters(parsePropertySearch({ beds: "2" }))).toBe(true);
  });
});
