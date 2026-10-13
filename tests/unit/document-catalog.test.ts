import { describe, expect, it } from "vitest";
import { canGenerate, documentTypes, generatableTypes } from "@/server/documents/catalog";
import { notificationTypes, ruleSettings } from "@/lib/ops/constants";
import { opsEn } from "@/i18n/dictionaries/ops.en";
import { opsKm } from "@/i18n/dictionaries/ops.km";
import { opsZh } from "@/i18n/dictionaries/ops.zh";
import { staffRoles } from "@/lib/staff-roles";

describe("document permissions", () => {
  it("restricts money documents to finance-capable roles", () => {
    expect(canGenerate("agent", "commission_statement")).toBe(false);
    expect(canGenerate("marketing", "commission_statement")).toBe(false);
    expect(canGenerate("finance", "commission_statement")).toBe(true);
    expect(canGenerate("manager", "commission_statement")).toBe(true);
  });

  it("keeps landlord submissions and agreement drafts to managers", () => {
    for (const role of staffRoles) {
      const allowed = role === "super_admin" || role === "manager";
      expect(canGenerate(role, "landlord_submission")).toBe(allowed);
      expect(canGenerate(role, "agreement_draft")).toBe(allowed);
    }
  });

  it("gives marketing only listing sheets", () => {
    expect(generatableTypes("marketing")).toEqual(["listing_sheet"]);
  });

  it("has a name and description for every type in every language", () => {
    for (const dict of [opsEn, opsKm, opsZh]) {
      for (const type of documentTypes) {
        expect(dict.documents.types[type].name.length).toBeGreaterThan(0);
        expect(dict.documents.types[type].description.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("operations dictionaries", () => {
  it("name every notification type and automation rule in every language", () => {
    for (const dict of [opsEn, opsKm, opsZh]) {
      for (const type of notificationTypes) expect(dict.notifications.types[type]).toBeTruthy();
      for (const [code, fields] of Object.entries(ruleSettings)) {
        expect(dict.automation.rules[code as keyof typeof dict.automation.rules].name).toBeTruthy();
        for (const field of fields) {
          expect(dict.automation.fields[field as keyof typeof dict.automation.fields]).toBeTruthy();
        }
      }
    }
  });

  it("has translated Khmer and Chinese that differ from English", () => {
    expect(opsKm.notifications.title).not.toBe(opsEn.notifications.title);
    expect(opsZh.automation.title).not.toBe(opsEn.automation.title);
  });
});
