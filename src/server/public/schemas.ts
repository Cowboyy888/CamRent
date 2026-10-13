import { z } from "zod";
import { locales } from "@/i18n/config";
import { propertyCategories, propertyTypes } from "@/types/property";
import { submitterRelationships } from "./constants";

/**
 * Validation for the public forms. All of it runs on the server; the HTML
 * attributes in the forms are only a convenience.
 */
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const text = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

const requiredText = (max: number) => z.string().trim().min(1).max(max);

/** Digits with the usual separators; 6 to 20 digits. */
const phone = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .max(30)
    .regex(/^\+?[0-9\s().-]+$/)
    .refine((value) => {
      const digits = value.replace(/\D/g, "").length;
      return digits >= 6 && digits <= 20;
    })
    .optional(),
);

const email = z.preprocess(blankToUndefined, z.email().max(254).optional());

const consent = z.preprocess((value) => value === "on" || value === "true", z.literal(true));

const locale = z.enum(locales).catch("en");

export const enquirySchema = z.object({
  name: requiredText(120),
  phone,
  email,
  message: text(1000),
  consent,
  locale,
  propertyId: z.preprocess(blankToUndefined, z.guid().optional()),
});

export const landlordSubmissionSchema = z.object({
  name: requiredText(120),
  relationship: z.enum(submitterRelationships),
  phone,
  email,
  language: locale,
  category: z.enum(propertyCategories),
  type: z.preprocess(blankToUndefined, z.enum(propertyTypes).optional()),
  district: text(120),
  neighborhood: text(120),
  address: text(300),
  bedrooms: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(0).max(50).optional(),
  ),
  /** Whole US dollars; stored as minor units. */
  expectedRent: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(0).max(1_000_000).optional(),
  ),
  description: text(2000),
  consent,
});
