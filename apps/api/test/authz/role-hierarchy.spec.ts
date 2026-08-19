import { describe, expect, it } from "vitest";
import { canGrantRole, canManageMember, compareRoles, roleRank } from "@helix/api-schemas";

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

  // canManageMember — строго `>`, не `>=`: два ADMIN'а не должны иметь право взаимно
  // понижать/удалять друг друга. Owner может всё (кроме отдельного инварианта "последний Owner").
  it("canManageMember: actor > target — можно", () => {
    expect(canManageMember("OWNER", "ADMIN")).toBe(true);
    expect(canManageMember("OWNER", "OWNER")).toBe(false);
    expect(canManageMember("ADMIN", "MANAGER")).toBe(true);
    expect(canManageMember("ADMIN", "MEMBER")).toBe(true);
  });

  it("canManageMember: actor равен или младше target — нельзя", () => {
    expect(canManageMember("ADMIN", "ADMIN")).toBe(false);
    expect(canManageMember("ADMIN", "OWNER")).toBe(false);
    expect(canManageMember("MANAGER", "ADMIN")).toBe(false);
    expect(canManageMember("MEMBER", "OWNER")).toBe(false);
  });
});
