import { validRolesFor, dealRoleSchema } from "@helix/api-schemas";
import { describe, expect, it } from "vitest";

// validRolesFor — RECOMMENDATION model (§4): ранжирует, не отклоняет. Здесь фиксируем сами наборы;
// «не 400 на неуместную роль» проверяется на HTTP-уровне в project-contacts.spec.
describe("validRolesFor (§4 recommendation model)", () => {
  it("B2B / MIXED → полный набор ролей", () => {
    expect(new Set(validRolesFor("B2B"))).toEqual(new Set(dealRoleSchema.options));
    expect(new Set(validRolesFor("MIXED"))).toEqual(new Set(dealRoleSchema.options));
  });

  it("B2C → подмножество без комитетских ролей (ECONOMIC/TECHNICAL_BUYER вырождаются)", () => {
    const b2c = new Set(validRolesFor("B2C"));
    expect(b2c.has("ECONOMIC_BUYER")).toBe(false);
    expect(b2c.has("TECHNICAL_BUYER")).toBe(false);
    expect(b2c.has("DECISION_MAKER")).toBe(true);
  });

  it("dealRoleSchema отвергает значение вне enum", () => {
    expect(dealRoleSchema.safeParse("CHAMPION").success).toBe(true);
    expect(dealRoleSchema.safeParse("champion").success).toBe(false);
    expect(dealRoleSchema.safeParse("USER").success).toBe(false);
  });
});
