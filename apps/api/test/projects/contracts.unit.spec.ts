import {
  createProjectSchema,
  updateProjectSchema,
  moveProjectSchema,
  boardQuerySchema,
  projectEventSchema,
} from "@helix/api-schemas";
import { describe, expect, it } from "vitest";

describe("Project contracts (§2)", () => {
  describe("createProjectSchema", () => {
    it("требует непустой title", () => {
      expect(createProjectSchema.safeParse({ title: "Lead" }).success).toBe(true);
      expect(createProjectSchema.safeParse({ title: "  " }).success).toBe(false);
      expect(createProjectSchema.safeParse({}).success).toBe(false);
    });

    it("currency — только ISO-4217 (3 заглавные)", () => {
      expect(createProjectSchema.safeParse({ title: "x", currency: "USD" }).success).toBe(true);
      expect(createProjectSchema.safeParse({ title: "x", currency: "LOL" }).success).toBe(true); // 3 буквы — формат ок
      expect(createProjectSchema.safeParse({ title: "x", currency: "usd" }).success).toBe(false);
      expect(createProjectSchema.safeParse({ title: "x", currency: "US" }).success).toBe(false);
    });

    it("value не отрицательный", () => {
      expect(createProjectSchema.safeParse({ title: "x", value: -1 }).success).toBe(false);
    });
  });

  describe("updateProjectSchema", () => {
    it("пустой объект отвергается (хотя бы одно поле)", () => {
      expect(updateProjectSchema.safeParse({}).success).toBe(false);
    });

    it("status / phaseId / rank отсекаются, не принимаются", () => {
      const parsed = updateProjectSchema.parse({ title: "x", status: "WON", phaseId: "ph", rank: "z9" });
      expect(parsed).toEqual({ title: "x" });
    });
  });

  describe("moveProjectSchema", () => {
    it("afterId/beforeId допускают null и отсутствие", () => {
      expect(moveProjectSchema.safeParse({ toPhaseId: "ph" }).success).toBe(true);
      expect(moveProjectSchema.safeParse({ toPhaseId: "ph", afterId: null, beforeId: null }).success).toBe(true);
      expect(moveProjectSchema.safeParse({ toPhaseId: "ph", afterId: "a", beforeId: "b" }).success).toBe(true);
    });

    it("toPhaseId обязателен", () => {
      expect(moveProjectSchema.safeParse({ afterId: "a" }).success).toBe(false);
    });
  });

  describe("boardQuerySchema", () => {
    it("дефолт 50, coerce строки, max 100", () => {
      expect(boardQuerySchema.parse({}).limitPerPhase).toBe(50);
      expect(boardQuerySchema.parse({ limitPerPhase: "20" }).limitPerPhase).toBe(20);
      expect(boardQuerySchema.safeParse({ limitPerPhase: 101 }).success).toBe(false);
    });
  });

  describe("projectEventSchema (discriminated union)", () => {
    it("project.moved требует снапшот фаз", () => {
      const ok = projectEventSchema.safeParse({
        type: "project.moved",
        schemaVersion: 1,
        payload: {
          fromPhaseKey: "discovery",
          fromPhaseName: { ru: "Дискавери" },
          toPhaseKey: "contract",
          toPhaseName: { ru: "Контракт" },
          actorName: "Асад",
        },
      });
      expect(ok.success).toBe(true);
    });

    it("project.moved с payload от другого типа отвергается", () => {
      const bad = projectEventSchema.safeParse({
        type: "project.moved",
        schemaVersion: 1,
        payload: { actorName: "Асад" },
      });
      expect(bad.success).toBe(false);
    });

    it("неизвестный тип отвергается", () => {
      expect(
        projectEventSchema.safeParse({ type: "project.exploded", schemaVersion: 1, payload: {} }).success,
      ).toBe(false);
    });
  });
});
