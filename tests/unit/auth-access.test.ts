import { describe, expect, it } from "vitest";
import { isStaffRole, staffRoleLabels, staffRoles } from "@/lib/staff-roles";
import { resolveAdminAccess } from "@/server/auth/access";
import { safeNextPath } from "@/server/auth/redirect";

describe("resolveAdminAccess", () => {
  const profile = { full_name: "Sok Dara", role: "agent", is_active: true };

  it("grants access to an active staff profile", () => {
    expect(resolveAdminAccess("user-1", "dara@example.com", profile)).toEqual({
      status: "authenticated",
      userId: "user-1",
      role: "agent",
      fullName: "Sok Dara",
      email: "dara@example.com",
    });
  });

  it("treats a signed-in user without a profile as anonymous", () => {
    expect(resolveAdminAccess("user-1", null, null)).toEqual({ status: "anonymous" });
    expect(resolveAdminAccess("user-1", null, undefined)).toEqual({ status: "anonymous" });
  });

  it("treats a deactivated profile as anonymous", () => {
    expect(resolveAdminAccess("user-1", null, { ...profile, is_active: false })).toEqual({
      status: "anonymous",
    });
  });

  it("rejects unknown roles and missing users", () => {
    expect(resolveAdminAccess("user-1", null, { ...profile, role: "owner" })).toEqual({
      status: "anonymous",
    });
    expect(resolveAdminAccess(null, null, profile)).toEqual({ status: "anonymous" });
  });
});

describe("staff roles", () => {
  it("lists exactly the five database roles", () => {
    expect([...staffRoles].sort()).toEqual(["agent", "finance", "manager", "marketing", "super_admin"]);
    expect(Object.values(staffRoleLabels).every((label) => label.length > 0)).toBe(true);
  });

  it("recognises only real roles", () => {
    expect(isStaffRole("manager")).toBe(true);
    expect(isStaffRole("admin")).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });
});

describe("safeNextPath", () => {
  const home = "/en/dashboard";

  it("keeps paths inside the CRM, in any language", () => {
    expect(safeNextPath("/en/dashboard", home)).toBe("/en/dashboard");
    expect(safeNextPath("/km/dashboard/leads?stage=new&page=2", home)).toBe(
      "/km/dashboard/leads?stage=new&page=2",
    );
    expect(safeNextPath("/zh/dashboard/leads/abc-123", home)).toBe("/zh/dashboard/leads/abc-123");
  });

  it.each([
    "https://evil.example/en/dashboard",
    "//evil.example",
    "/\\evil.example",
    "/en/dashboardx",
    "/en/login",
    "/admin",
    "/fr/dashboard",
    "javascript:alert(1)",
    "/en/dashboard\n/x",
    "/en/dashboard/../login",
    "/en/dashboard/<script>",
    "",
  ])("falls back for %j", (value) => {
    expect(safeNextPath(value, home)).toBe(home);
  });

  it("falls back when missing", () => {
    expect(safeNextPath(undefined, home)).toBe(home);
    expect(safeNextPath(null, home)).toBe(home);
  });
});
