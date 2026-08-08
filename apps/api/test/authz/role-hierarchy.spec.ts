import { describe, expect, it } from "vitest";
import { canGrantRole, compareRoles, roleRank } from "../../src/core/authz/role-hierarchy";

describe("role-hierarchy", () => {
  it("roleRank: OWNER > ADMIN > MANAGER > MEMBER > VIEWER", () => {
    expect(roleRank("OWNER")).toBeGreaterThan(roleRank("ADMIN"));
    expect(roleRank("ADMIN")).toBeGreaterThan(roleRank("MANAGER"));
    expect(roleRank("MANAGER")).toBeGreaterThan(roleRank("MEMBER"));
    expect(roleRank("MEMBER")).toBeGreaterThan(roleRank("VIEWER"));
  });

  it("compareRoles: положительно/отрицательно/ноль по знаку разницы рангов", () => {
    expect(compareRoles("OWNER", "VIEWER")).toBeGreaterThan(0);
    expect(compareRoles("VIEWER", "OWNER")).toBeLessThan(0);
    expect(compareRoles("ADMIN", "ADMIN")).toBe(0);
  });

  it("canGrantRole: роль не выше собственного ранга — можно", () => {
    expect(canGrantRole("OWNER", "OWNER")).toBe(true);
    expect(canGrantRole("ADMIN", "ADMIN")).toBe(true);
    expect(canGrantRole("ADMIN", "MEMBER")).toBe(true);
  });

  it("canGrantRole: роль выше собственного ранга — нельзя", () => {
    expect(canGrantRole("ADMIN", "OWNER")).toBe(false);
    expect(canGrantRole("MEMBER", "MANAGER")).toBe(false);
  });
});
