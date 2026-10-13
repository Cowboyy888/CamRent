import { describe, expect, it } from "vitest";
import { sanitizeAreaTerm } from "@/server/properties/queries";
import {
  areaName,
  pickTranslation,
  readProperty,
  toCard,
  toDetail,
  type PublicPropertyRow,
} from "@/server/properties/model";
import { enquirySchema, landlordSubmissionSchema } from "@/server/public/schemas";

const row: PublicPropertyRow = {
  id: "11111111-1111-4111-8111-111111111111",
  listing_code: "PP-R-0001",
  category: "residential",
  property_type: "condo",
  city: "Phnom Penh",
  district: "Chamkar Mon",
  neighborhood: "BKK1",
  monthly_rent_minor: 120000,
  currency: "USD",
  bedrooms: 2,
  bathrooms: 2,
  floor_area: 85.5,
  area_unit: "sqm",
  furnishing_status: "fully_furnished",
  deposit_amount_minor: 240000,
  lease_terms: "  ",
  availability_status: "available",
  available_from: null,
  updated_at: "2026-10-01T00:00:00Z",
  created_at: "2026-10-01T00:00:00Z",
};

describe("pickTranslation", () => {
  const all = [
    { locale: "en", title: "English" },
    { locale: "zh", title: "中文" },
  ];
  it("prefers the visitor's language", () => {
    expect(pickTranslation(all, "zh")?.title).toBe("中文");
  });
  it("falls back to English, then to any language", () => {
    expect(pickTranslation(all, "km")?.title).toBe("English");
    expect(pickTranslation([{ locale: "zh", title: "中文" }], "km")?.title).toBe("中文");
  });
  it("returns null instead of inventing text", () => {
    expect(pickTranslation([], "en")).toBeNull();
  });
});

describe("readProperty / toCard / toDetail", () => {
  it("accepts a complete row and skips a malformed one", () => {
    expect(readProperty(row)?.listing_code).toBe("PP-R-0001");
    expect(readProperty({ ...row, listing_code: null })).toBeNull();
    expect(readProperty({ ...row, monthly_rent_minor: null })).toBeNull();
    expect(readProperty({ ...row, availability_status: "rented" })).toBeNull();
  });

  it("builds a card with only database values", () => {
    const property = readProperty(row)!;
    const card = toCard(property, null, null, (id) => `/en/properties/${id}`);
    expect(card.title).toBeNull();
    expect(card.areaName).toBe("BKK1, Chamkar Mon");
    expect(card.rent).toEqual({ amountMinor: 120000, currency: "USD" });
    expect(card.floorArea).toEqual({ value: 85.5, unit: "sqm" });
    expect(card.href).toBe("/en/properties/11111111-1111-4111-8111-111111111111");
  });

  it("falls back to the city when there is no district or neighbourhood", () => {
    expect(areaName({ city: "Phnom Penh", district: null, neighborhood: null })).toBe("Phnom Penh");
  });

  it("drops blank free text and keeps absent fields absent", () => {
    const detail = toDetail(
      readProperty({ ...row, bedrooms: null, floor_area: null, deposit_amount_minor: null })!,
      { property_id: row.id, locale: "en", title: "T", description: "   ", amenities: null },
      [],
    );
    expect(detail.leaseTerms).toBeNull();
    expect(detail.description).toBeNull();
    expect(detail.amenities).toEqual([]);
    expect(detail.bedrooms).toBeNull();
    expect(detail.floorArea).toBeNull();
    expect(detail.deposit).toBeNull();
  });
});

describe("sanitizeAreaTerm", () => {
  it("removes characters that could alter a filter expression", () => {
    expect(sanitizeAreaTerm("BKK1),id.eq.1,(x")).toBe("BKK1 id.eq.1 x");
    expect(sanitizeAreaTerm("100%_*")).toBe("100");
  });
  it("keeps Khmer and Chinese text", () => {
    expect(sanitizeAreaTerm("ទួលគោក")).toBe("ទួលគោក");
    expect(sanitizeAreaTerm("金边 BKK1")).toBe("金边 BKK1");
  });
});

describe("enquirySchema", () => {
  const valid = { name: "Dara", phone: "+855 12 345 678", consent: "on", locale: "km" };
  it("accepts a valid enquiry", () => {
    const result = enquirySchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
  it("requires consent and a name", () => {
    expect(enquirySchema.safeParse({ ...valid, consent: undefined }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...valid, name: " " }).success).toBe(false);
  });
  it("rejects malformed phone, email and property id", () => {
    expect(enquirySchema.safeParse({ ...valid, phone: "call me" }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...valid, phone: "123" }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...valid, propertyId: "1; drop table" }).success).toBe(false);
  });
  it("treats an unknown locale as English", () => {
    const parsed = enquirySchema.parse({ ...valid, locale: "fr" });
    expect(parsed.locale).toBe("en");
  });
  it("limits the message length", () => {
    expect(enquirySchema.safeParse({ ...valid, message: "x".repeat(1001) }).success).toBe(false);
  });
});

describe("landlordSubmissionSchema", () => {
  const valid = {
    name: "Sokha",
    relationship: "owner",
    phone: "012345678",
    language: "en",
    category: "residential",
    consent: "on",
  };
  it("accepts a minimal submission", () => {
    expect(landlordSubmissionSchema.safeParse(valid).success).toBe(true);
  });
  it("converts optional numbers and blanks", () => {
    const parsed = landlordSubmissionSchema.parse({
      ...valid,
      bedrooms: "3",
      expectedRent: "850",
      district: "",
      type: "",
    });
    expect(parsed.bedrooms).toBe(3);
    expect(parsed.expectedRent).toBe(850);
    expect(parsed.district).toBeUndefined();
    expect(parsed.type).toBeUndefined();
  });
  it("rejects unknown relationships, categories and negative rent", () => {
    expect(landlordSubmissionSchema.safeParse({ ...valid, relationship: "stranger" }).success).toBe(false);
    expect(landlordSubmissionSchema.safeParse({ ...valid, category: "castle" }).success).toBe(false);
    expect(landlordSubmissionSchema.safeParse({ ...valid, expectedRent: "-1" }).success).toBe(false);
  });
});
